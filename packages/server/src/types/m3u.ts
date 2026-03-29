/**
 * M3U playlist type definitions.
 */

export interface ParsedM3uChannel {
  /** Channel display name (from after the comma in #EXTINF) */
  name: string;
  /** Direct stream URL */
  streamUrl: string;
  /** EPG matching ID (tvg-id attribute) */
  tvgId: string | null;
  /** EPG matching name (tvg-name attribute) */
  tvgName: string | null;
  /** Channel logo URL (tvg-logo attribute) */
  tvgLogo: string | null;
  /** Group/category (group-title attribute) */
  groupTitle: string | null;
  /** Channel number (tvg-chno attribute) */
  channelNumber: number | null;
  /** Stream type inferred from URL extension */
  streamType: 'hls' | 'mpegts';
}

export interface ParsedM3u {
  /** EPG URL from header x-tvg-url or url-tvg */
  epgUrl: string | null;
  /** Parsed channels */
  channels: ParsedM3uChannel[];
}
