import axios from 'axios';
import { db } from '../db.js';
import { logger } from '../logger.js';
import { parseM3u } from './m3u-parser.js';
import type { Source } from '@prisma/client';

/**
 * SourceManager handles fetching M3U playlists (and later Xtream Codes),
 * parsing them, and upserting channels into the database.
 */

/**
 * Fetch an M3U playlist from a URL and return the raw content.
 */
async function fetchM3uContent(url: string): Promise<string> {
  const response = await axios.get<string>(url, {
    timeout: 60_000,
    responseType: 'text',
    maxContentLength: 100 * 1024 * 1024, // 100MB max
    headers: {
      'User-Agent': 'AnywhereDVR/0.1',
    },
  });
  return response.data;
}

/**
 * Sync an M3U source: fetch playlist, parse channels, upsert to database.
 * Replaces all existing channels for this source (delete + create).
 */
async function syncM3uSource(source: Source): Promise<{ channelCount: number }> {
  if (!source.m3uUrl) {
    throw new Error(`Source "${source.name}" has no M3U URL`);
  }

  logger.info({ sourceId: source.id, name: source.name }, 'Syncing M3U source');

  // Fetch and parse
  const content = await fetchM3uContent(source.m3uUrl);
  const parsed = parseM3u(content);

  // If EPG URL was found in the M3U header and source doesn't have one set, store it
  if (parsed.epgUrl && !source.epgUrl) {
    await db.source.update({
      where: { id: source.id },
      data: { epgUrl: parsed.epgUrl },
    });
  }

  // Replace all channels for this source in a transaction
  const channelCount = await db.$transaction(async (tx) => {
    // Delete existing channels (cascade deletes programs too)
    await tx.channel.deleteMany({ where: { sourceId: source.id } });

    // Create new channels
    if (parsed.channels.length > 0) {
      await tx.channel.createMany({
        data: parsed.channels.map((ch) => ({
          sourceId: source.id,
          name: ch.name,
          streamUrl: ch.streamUrl,
          streamType: ch.streamType,
          tvgId: ch.tvgId,
          tvgName: ch.tvgName,
          tvgLogo: ch.tvgLogo,
          groupTitle: ch.groupTitle,
          channelNumber: ch.channelNumber,
        })),
      });
    }

    return parsed.channels.length;
  });

  // Update sync timestamp
  await db.source.update({
    where: { id: source.id },
    data: {
      lastSyncAt: new Date(),
      syncError: null,
    },
  });

  logger.info(
    { sourceId: source.id, channelCount },
    'M3U source synced successfully',
  );

  return { channelCount };
}

/**
 * Sync a source based on its type. Currently only M3U is implemented.
 * Xtream Codes will be added in Phase 6.
 */
export async function syncSource(
  sourceId: string,
): Promise<{ channelCount: number }> {
  const source = await db.source.findUnique({ where: { id: sourceId } });
  if (!source) {
    throw new Error(`Source not found: ${sourceId}`);
  }

  try {
    switch (source.type) {
      case 'M3U':
        return await syncM3uSource(source);
      case 'XTREAM':
        // TODO: Phase 6 — Xtream Codes API sync
        throw new Error('Xtream Codes sync not yet implemented');
      default:
        throw new Error(`Unknown source type: ${source.type}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown sync error';
    logger.error({ sourceId, err }, 'Source sync failed');

    // Store error on source
    await db.source.update({
      where: { id: sourceId },
      data: { syncError: message },
    });

    throw err;
  }
}
