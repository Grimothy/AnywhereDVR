// packages/server/src/types/epg.ts

/**
 * Parsed program from XMLTV feed
 */
export interface ParsedProgram {
  channelXmltvId: string;        // XMLTV channel@id
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  startTime: Date;               // UTC Date object
  endTime: Date;                 // UTC Date object
  season: number | null;
  episode: number | null;
  iconUrl: string | null;
  isNew: boolean;
}

/**
 * XMLTV channel metadata (for reference, not stored separately)
 */
export interface ParsedChannel {
  xmltvId: string;               // channel@id
  displayName: string;
  iconUrl: string | null;
}

/**
 * EPG API response shape for GET /api/v1/epg
 */
export interface EpgChannelPrograms {
  channelId: string;
  channelName: string;
  channelLogo: string | null;
  programs: EpgProgram[];
}

export interface EpgProgram {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  startTime: string;             // ISO 8601 string
  endTime: string;               // ISO 8601 string
  season: number | null;
  episode: number | null;
  category: string | null;
  isNew: boolean;
  isScheduled: boolean;          // Has matching recording rule
  isRecording: boolean;          // Currently being recorded
  recordingId: string | null;    // Recording ID if scheduled/recording
  // Enriched metadata from TMDB
  posterUrl: string | null;
  backdropUrl: string | null;
  logoUrl: string | null;
  overview: string | null;
  genres: string[];
}
