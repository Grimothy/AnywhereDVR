// packages/server/src/services/xmltv-parser.ts

import { XMLParser } from 'fast-xml-parser';
import { ParsedProgram, ParsedChannel } from '../types/epg.js';
import { logger } from '../logger.js';
import { gunzipSync } from 'zlib';

/**
 * Parses XMLTV format EPG data into Program objects.
 *
 * XMLTV structure:
 * <tv>
 *   <channel id="CNN.us">
 *     <display-name>CNN</display-name>
 *     <icon src="http://logo.png"/>
 *   </channel>
 *   <programme start="20260328210000 +0000" stop="20260328220000 +0000" channel="CNN.us">
 *     <title lang="en">Anderson Cooper 360</title>
 *     <sub-title lang="en">Episode Title</sub-title>
 *     <desc lang="en">Description text</desc>
 *     <category lang="en">News</category>
 *     <episode-num system="onscreen">S15E142</episode-num>
 *     <episode-num system="xmltv_ns">14.141.</episode-num>
 *     <icon src="http://artwork.png"/>
 *     <new/>
 *   </programme>
 * </tv>
 *
 * Date format: YYYYMMDDHHmmss +HHMM (or -HHMM)
 *
 * Episode number formats:
 * - onscreen: "S15E142" → season=15, episode=142
 * - xmltv_ns: "14.141." → season=15, episode=142 (0-indexed, so add 1)
 * - SxxExx pattern in title or subtitle
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: false,
  trimValues: true,
  processEntities: false,
});

/**
 * Parse XMLTV date format to UTC Date object
 * Format: YYYYMMDDHHmmss +HHMM or -HHMM
 * Example: "20260328210000 +0000"
 */
function parseXmltvDate(dateStr: string): Date {
  // Extract parts: YYYYMMDDHHMMSS and offset
  const match = dateStr.match(/^(\d{14})\s*([+-]\d{4})$/);
  if (!match) {
    throw new Error(`Invalid XMLTV date format: ${dateStr}`);
  }

  const [, digits, offset] = match;
  
  // Parse base date components
  const year = parseInt(digits.substring(0, 4), 10);
  const month = parseInt(digits.substring(4, 6), 10) - 1; // JS months are 0-indexed
  const day = parseInt(digits.substring(6, 8), 10);
  const hour = parseInt(digits.substring(8, 10), 10);
  const minute = parseInt(digits.substring(10, 12), 10);
  const second = parseInt(digits.substring(12, 14), 10);

  // Parse timezone offset
  const offsetSign = offset[0] === '+' ? 1 : -1;
  const offsetHours = parseInt(offset.substring(1, 3), 10);
  const offsetMinutes = parseInt(offset.substring(3, 5), 10);
  const offsetMillis = offsetSign * (offsetHours * 60 + offsetMinutes) * 60 * 1000;

  // Create date in local time, then adjust for timezone offset to get UTC
  const localDate = new Date(year, month, day, hour, minute, second);
  return new Date(localDate.getTime() - offsetMillis);
}

/**
 * Extract season and episode numbers from various formats
 */
function extractEpisodeNumbers(episodeNums: any, title?: string, subtitle?: string): { season: number | null; episode: number | null } {
  let season: number | null = null;
  let episode: number | null = null;

  // Handle episode-num elements (can be array or single object)
  if (episodeNums) {
    const nums = Array.isArray(episodeNums) ? episodeNums : [episodeNums];

    for (const num of nums) {
      const system = num['@_system'];
      const value = num['#text'] || num;

      if (system === 'onscreen') {
        // Format: "S15E142"
        const match = value.match(/S(\d+)E(\d+)/i);
        if (match) {
          season = parseInt(match[1], 10);
          episode = parseInt(match[2], 10);
          break;
        }
      } else if (system === 'xmltv_ns') {
        // Format: "14.141." (0-indexed, so add 1)
        const parts = value.split('.');
        if (parts[0]) season = parseInt(parts[0], 10) + 1;
        if (parts[1]) episode = parseInt(parts[1], 10) + 1;
        break;
      }
    }
  }

  // Fallback: check title or subtitle for SxxExx pattern
  if (season === null || episode === null) {
    const text = `${title || ''} ${subtitle || ''}`;
    const match = text.match(/S(\d+)E(\d+)/i);
    if (match) {
      season = season || parseInt(match[1], 10);
      episode = episode || parseInt(match[2], 10);
    }
  }

  return { season, episode };
}

/**
 * Extract text value from XML node (handles both string and object with #text)
 */
function getText(node: any): string | null {
  if (!node) return null;
  if (typeof node === 'string') return node;
  if (node['#text']) return node['#text'];
  return null;
}

/**
 * Parse XMLTV XML string into ParsedProgram array
 */
export function parseXmltv(xmlData: string | Buffer): { channels: ParsedChannel[]; programs: ParsedProgram[] } {
  try {
    // Handle gzip-compressed data
    let xml: string;
    if (Buffer.isBuffer(xmlData)) {
      // Check for gzip magic bytes (1f 8b)
      if (xmlData[0] === 0x1f && xmlData[1] === 0x8b) {
        logger.info('Detected gzip-compressed XMLTV feed, decompressing...');
        xml = gunzipSync(xmlData).toString('utf-8');
      } else {
        xml = xmlData.toString('utf-8');
      }
    } else {
      xml = xmlData;
    }

    const parsed = parser.parse(xml);
    const tv = parsed.tv;

    if (!tv) {
      throw new Error('Invalid XMLTV: missing <tv> root element');
    }

    // Parse channels
    const channels: ParsedChannel[] = [];
    const rawChannels = tv.channel ? (Array.isArray(tv.channel) ? tv.channel : [tv.channel]) : [];

    for (const ch of rawChannels) {
      const xmltvId = ch['@_id'];
      if (!xmltvId) continue;

      const displayName = getText(Array.isArray(ch['display-name']) ? ch['display-name'][0] : ch['display-name']);
      const icon = ch.icon ? (Array.isArray(ch.icon) ? ch.icon[0] : ch.icon) : null;
      const iconUrl = icon ? icon['@_src'] : null;

      channels.push({
        xmltvId,
        displayName: displayName || xmltvId,
        iconUrl,
      });
    }

    // Parse programs
    const programs: ParsedProgram[] = [];
    const rawPrograms = tv.programme ? (Array.isArray(tv.programme) ? tv.programme : [tv.programme]) : [];

    // Only keep programs within ±7 days of now
    const now = new Date();
    const minDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const maxDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    for (const prog of rawPrograms) {
      try {
        const channelXmltvId = prog['@_channel'];
        const startStr = prog['@_start'];
        const stopStr = prog['@_stop'];

        if (!channelXmltvId || !startStr || !stopStr) {
          logger.warn('Skipping program with missing channel/start/stop', { prog });
          continue;
        }

        const startTime = parseXmltvDate(startStr);
        const endTime = parseXmltvDate(stopStr);

        // Filter by date range
        if (startTime < minDate || startTime > maxDate) {
          continue;
        }

        const title = getText(prog.title) || 'Unknown';
        const subtitle = getText(prog['sub-title']);
        const description = getText(prog.desc);
        const category = getText(Array.isArray(prog.category) ? prog.category[0] : prog.category);

        const { season, episode } = extractEpisodeNumbers(prog['episode-num'], title, subtitle || undefined);

        const icon = prog.icon ? (Array.isArray(prog.icon) ? prog.icon[0] : prog.icon) : null;
        const iconUrl = icon ? icon['@_src'] : null;

        const isNew = prog.new !== undefined;

        programs.push({
          channelXmltvId,
          title,
          subtitle,
          description,
          category,
          startTime,
          endTime,
          season,
          episode,
          iconUrl,
          isNew,
        });
      } catch (err) {
        logger.warn('Failed to parse program', { error: err, prog });
      }
    }

    logger.info('XMLTV parsed successfully', {
      channelCount: channels.length,
      programCount: programs.length,
    });

    return { channels, programs };
  } catch (err) {
    logger.error('Failed to parse XMLTV', { error: err });
    throw new Error(`XMLTV parsing failed: ${err}`);
  }
}
