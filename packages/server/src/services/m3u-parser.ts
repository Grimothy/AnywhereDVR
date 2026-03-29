import type { ParsedM3u, ParsedM3uChannel } from '../types/m3u.js';
import { logger } from '../logger.js';

/**
 * Extract tag="value" pairs from an #EXTINF line.
 * Handles both double-quoted and single-quoted values.
 */
function extractAttributes(line: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /([\w-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    attrs[match[1].toLowerCase()] = match[2];
  }

  return attrs;
}

/**
 * Extract the display name from an #EXTINF line (text after the last comma).
 */
function extractDisplayName(line: string): string {
  const commaIndex = line.lastIndexOf(',');
  if (commaIndex === -1) return 'Unknown';
  return line.substring(commaIndex + 1).trim() || 'Unknown';
}

/**
 * Infer stream type from URL.
 * .m3u8 → hls, everything else → mpegts
 */
function inferStreamType(url: string): 'hls' | 'mpegts' {
  const cleanUrl = url.split('?')[0].toLowerCase();
  if (cleanUrl.endsWith('.m3u8')) return 'hls';
  return 'mpegts';
}

/**
 * Extract EPG URL from #EXTM3U header line.
 * Looks for x-tvg-url="..." or url-tvg="..."
 */
function extractEpgUrl(headerLine: string): string | null {
  const attrs = extractAttributes(headerLine);
  return attrs['x-tvg-url'] || attrs['url-tvg'] || null;
}

/**
 * Parse an M3U/M3U8 playlist string into structured channel data.
 *
 * Handles M3U Plus (extended) format with #EXTINF attributes:
 * - tvg-id, tvg-name, tvg-logo, group-title, tvg-chno
 *
 * @param content - Raw M3U file content
 * @returns Parsed playlist with optional EPG URL and channel array
 */
export function parseM3u(content: string): ParsedM3u {
  const lines = content.split(/\r?\n/).map((l) => l.trim());
  const channels: ParsedM3uChannel[] = [];
  let epgUrl: string | null = null;

  // Validate M3U header
  if (lines.length === 0 || !lines[0].startsWith('#EXTM3U')) {
    logger.warn('Content does not start with #EXTM3U header');
    return { epgUrl: null, channels: [] };
  }

  // Extract EPG URL from header
  epgUrl = extractEpgUrl(lines[0]);

  let i = 1;
  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines and comments that aren't #EXTINF
    if (!line || (line.startsWith('#') && !line.startsWith('#EXTINF'))) {
      i++;
      continue;
    }

    // Found an #EXTINF line — pair with next non-empty, non-comment line (the URL)
    if (line.startsWith('#EXTINF')) {
      const extinfLine = line;
      i++;

      // Find the URL line (skip empty lines and other directives)
      while (i < lines.length && (lines[i] === '' || lines[i].startsWith('#'))) {
        i++;
      }

      if (i >= lines.length) break;

      const streamUrl = lines[i].trim();
      if (!streamUrl) {
        i++;
        continue;
      }

      const attrs = extractAttributes(extinfLine);
      const name = extractDisplayName(extinfLine);
      const channelNumberRaw = attrs['tvg-chno'];

      const channel: ParsedM3uChannel = {
        name,
        streamUrl,
        tvgId: attrs['tvg-id'] || null,
        tvgName: attrs['tvg-name'] || null,
        tvgLogo: attrs['tvg-logo'] || null,
        groupTitle: attrs['group-title'] || null,
        channelNumber: channelNumberRaw ? parseInt(channelNumberRaw, 10) || null : null,
        streamType: inferStreamType(streamUrl),
      };

      channels.push(channel);
    }

    i++;
  }

  logger.info({ channelCount: channels.length, hasEpgUrl: !!epgUrl }, 'M3U parsed');
  return { epgUrl, channels };
}
