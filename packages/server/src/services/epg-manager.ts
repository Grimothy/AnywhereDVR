// packages/server/src/services/epg-manager.ts

import axios from 'axios';
import { db } from '../db.js';
import { logger } from '../logger.js';
import { parseXmltv } from './xmltv-parser.js';
import { ParsedProgram } from '../types/epg.js';
import { metadataEnricher } from './metadata-enricher.js';

/**
 * EPG Manager
 * 
 * Responsibilities:
 * - Fetch XMLTV data from Source.epgUrl
 * - Parse XMLTV using xmltv-parser
 * - Match programs to channels via tvgId
 * - Upsert programs to database
 * - Purge old programs (keep only ±7 days)
 */

export class EpgManager {
  /**
   * Refresh EPG for all sources that have an epgUrl
   */
  async refreshAll(): Promise<{ success: number; failed: number }> {
    const sources = await db.source.findMany({
      where: {
        epgUrl: { not: null },
      },
    });

    logger.info(`Starting EPG refresh for ${sources.length} source(s)`);

    let success = 0;
    let failed = 0;

    for (const source of sources) {
      try {
        await this.refreshSource(source.id);
        success++;
      } catch (err) {
        logger.error({ sourceId: source.id, error: err }, 'EPG refresh failed for source');
        failed++;
      }
    }

    logger.info(`EPG refresh complete: ${success} succeeded, ${failed} failed`);
    return { success, failed };
  }

  /**
   * Refresh EPG for a specific source
   */
  async refreshSource(sourceId: string): Promise<void> {
    const source = await db.source.findUnique({
      where: { id: sourceId },
      include: { channels: true },
    });

    if (!source) {
      throw new Error(`Source ${sourceId} not found`);
    }

    if (!source.epgUrl) {
      throw new Error(`Source ${source.name} has no EPG URL configured`);
    }

    logger.info({ sourceId, epgUrl: source.epgUrl }, 'Fetching EPG data');

    // Fetch XMLTV data
    const response = await axios.get(source.epgUrl, {
      responseType: 'arraybuffer',
      timeout: 60000, // 60 second timeout for large EPG files
      headers: {
        'Accept-Encoding': 'gzip',
      },
    });

    logger.info({ sourceId, size: response.data.length }, 'EPG data fetched, parsing...');

    // Parse XMLTV
    const { programs } = parseXmltv(response.data);

    logger.info({ sourceId, programCount: programs.length }, 'EPG parsed, matching to channels...');

    // Match programs to channels and store
    const stored = await this.storePrograms(source.id, source.channels, programs);

    // Purge old programs for this source's channels
    await this.purgeOldPrograms(source.channels.map(ch => ch.id));

    logger.info({ sourceId, stored }, 'EPG refresh complete for source');

    // Fire-and-forget metadata enrichment for unique show titles
    const uniqueTitles = [...new Set(programs.map(p => p.title))];
    metadataEnricher.enrichTitlesInBackground(uniqueTitles).catch(err => {
      logger.warn({ err, sourceId }, 'Background metadata enrichment failed');
    });
  }

  /**
   * Match parsed programs to channels and store in database
   */
  private async storePrograms(
    sourceId: string,
    channels: Array<{ id: string; tvgId: string | null; tvgName: string | null; name: string }>,
    programs: ParsedProgram[]
  ): Promise<number> {
    // Build lookup map: XMLTV channel ID → Channel DB ID
    const channelMap = new Map<string, string>();

    for (const channel of channels) {
      // Primary match: tvgId
      if (channel.tvgId) {
        channelMap.set(channel.tvgId, channel.id);
      }

      // Fallback: tvgName or name (normalized)
      const fallbackKey = (channel.tvgName || channel.name).toLowerCase().trim();
      if (!channelMap.has(fallbackKey)) {
        channelMap.set(fallbackKey, channel.id);
      }
    }

    let stored = 0;
    const batchSize = 100;

    // Process programs in batches for better performance
    for (let i = 0; i < programs.length; i += batchSize) {
      const batch = programs.slice(i, i + batchSize);

      for (const prog of batch) {
        // Match channel
        let channelId = channelMap.get(prog.channelXmltvId);

        // Fallback: try case-insensitive match on channelXmltvId
        if (!channelId) {
          const normalizedXmltvId = prog.channelXmltvId.toLowerCase().trim();
          channelId = channelMap.get(normalizedXmltvId);
        }

        if (!channelId) {
          logger.debug({ xmltvId: prog.channelXmltvId }, 'No matching channel found for program');
          continue;
        }

        try {
          // Upsert program (use unique constraint on channelId + startTime)
          await db.program.upsert({
            where: {
              channelId_startTime: {
                channelId,
                startTime: prog.startTime,
              },
            },
            update: {
              title: prog.title,
              subtitle: prog.subtitle,
              description: prog.description,
              category: prog.category,
              endTime: prog.endTime,
              season: prog.season,
              episode: prog.episode,
              iconUrl: prog.iconUrl,
              isNew: prog.isNew,
            },
            create: {
              channelId,
              title: prog.title,
              subtitle: prog.subtitle,
              description: prog.description,
              category: prog.category,
              startTime: prog.startTime,
              endTime: prog.endTime,
              season: prog.season,
              episode: prog.episode,
              iconUrl: prog.iconUrl,
              isNew: prog.isNew,
            },
          });

          stored++;
        } catch (err) {
          logger.warn({ error: err, program: prog }, 'Failed to store program');
        }
      }
    }

    return stored;
  }

  /**
   * Purge programs older than 7 days or newer than 7 days in the future
   */
  private async purgeOldPrograms(channelIds: string[]): Promise<void> {
    const now = new Date();
    const minDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const maxDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const deleted = await db.program.deleteMany({
      where: {
        channelId: { in: channelIds },
        OR: [
          { startTime: { lt: minDate } },
          { startTime: { gt: maxDate } },
        ],
      },
    });

    if (deleted.count > 0) {
      logger.info({ count: deleted.count }, 'Purged old programs');
    }
  }
}

// Singleton instance
export const epgManager = new EpgManager();
