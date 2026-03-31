// packages/server/src/services/xtream-client.ts

import axios from 'axios';
import { logger } from '../logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface XtreamConfig {
  host: string;
  username: string;
  password: string;
}

export interface XtreamServerInfo {
  userInfo: {
    username: string;
    maxConnections: number;
    expDate: string | null;
    status: string;
  };
  serverInfo: {
    url: string;
    port: string;
    httpsPort: string;
    serverProtocol: string;
    rtmpPort: string;
    timezone: string;
  };
}

export interface XtreamCategory {
  categoryId: string;
  categoryName: string;
  parentId: number;
}

export interface XtreamStream {
  num: number;
  name: string;
  streamType: string;
  streamId: number;
  streamIcon: string | null;
  epgChannelId: string | null;
  categoryId: string | null;
  tvArchive: number;
}

export interface XtreamEpgEntry {
  id: string;
  title: string;
  description: string;
  start: string; // ISO datetime string
  end: string;   // ISO datetime string
  lang: string;
}

// ── XtreamClient ──────────────────────────────────────────────────────────────

export class XtreamClient {
  private readonly baseUrl: string;

  constructor(private readonly config: XtreamConfig) {
    // Normalize host — strip trailing slash
    const host = config.host.replace(/\/$/, '');
    this.baseUrl = `${host}/player_api.php?username=${encodeURIComponent(config.username)}&password=${encodeURIComponent(config.password)}`;
  }

  private async get<T>(action: string, extra: Record<string, string | number> = {}): Promise<T> {
    const params = new URLSearchParams({ action, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])) });
    const url = `${this.baseUrl}&${params.toString()}`;

    const response = await axios.get<T>(url, {
      timeout: 30_000,
      headers: { 'User-Agent': 'AnywhereDVR/0.1' },
    });

    return response.data;
  }

  /**
   * Fetch server info and user account details.
   * Also validates credentials — throws if auth fails.
   */
  async getServerInfo(): Promise<XtreamServerInfo> {
    // No action = server info endpoint
    const response = await axios.get<{
      user_info: {
        username: string;
        max_connections: string;
        exp_date: string | null;
        status: string;
      };
      server_info: {
        url: string;
        port: string;
        https_port: string;
        server_protocol: string;
        rtmp_port: string;
        timezone: string;
      };
    }>(this.baseUrl, {
      timeout: 30_000,
      headers: { 'User-Agent': 'AnywhereDVR/0.1' },
    });

    const d = response.data;
    return {
      userInfo: {
        username: d.user_info?.username ?? '',
        maxConnections: parseInt(d.user_info?.max_connections ?? '1', 10),
        expDate: d.user_info?.exp_date ?? null,
        status: d.user_info?.status ?? 'unknown',
      },
      serverInfo: {
        url: d.server_info?.url ?? '',
        port: d.server_info?.port ?? '80',
        httpsPort: d.server_info?.https_port ?? '443',
        serverProtocol: d.server_info?.server_protocol ?? 'http',
        rtmpPort: d.server_info?.rtmp_port ?? '1935',
        timezone: d.server_info?.timezone ?? 'UTC',
      },
    };
  }

  /**
   * Fetch live stream categories.
   */
  async getCategories(): Promise<XtreamCategory[]> {
    const raw = await this.get<Array<{
      category_id: string;
      category_name: string;
      parent_id: number;
    }>>('get_live_categories');

    if (!Array.isArray(raw)) return [];

    return raw.map((c) => ({
      categoryId: c.category_id ?? '',
      categoryName: c.category_name ?? 'Unknown',
      parentId: c.parent_id ?? 0,
    }));
  }

  /**
   * Fetch all live streams.
   */
  async getLiveStreams(): Promise<XtreamStream[]> {
    const raw = await this.get<Array<{
      num: number;
      name: string;
      stream_type: string;
      stream_id: number;
      stream_icon: string | null;
      epg_channel_id: string | null;
      category_id: string | null;
      tv_archive: number;
    }>>('get_live_streams');

    if (!Array.isArray(raw)) return [];

    return raw.map((s) => ({
      num: s.num ?? 0,
      name: s.name ?? 'Unknown',
      streamType: s.stream_type ?? 'live',
      streamId: s.stream_id,
      streamIcon: s.stream_icon ?? null,
      epgChannelId: s.epg_channel_id ?? null,
      categoryId: s.category_id ?? null,
      tvArchive: s.tv_archive ?? 0,
    }));
  }

  /**
   * Build the HLS stream URL for a given stream ID.
   * Prefers .m3u8 (HLS) over .ts for compatibility.
   */
  buildStreamUrl(streamId: number, format: 'ts' | 'm3u8' = 'm3u8'): string {
    const host = this.config.host.replace(/\/$/, '');
    return `${host}/live/${encodeURIComponent(this.config.username)}/${encodeURIComponent(this.config.password)}/${streamId}.${format}`;
  }

  /**
   * Return the XMLTV EPG URL for this provider.
   * Used by EpgManager to fetch EPG data for Xtream sources.
   */
  getXmltvUrl(): string {
    const host = this.config.host.replace(/\/$/, '');
    return `${host}/xmltv.php?username=${encodeURIComponent(this.config.username)}&password=${encodeURIComponent(this.config.password)}`;
  }

  /**
   * Fetch short EPG for a specific stream.
   */
  async getShortEpg(streamId: number): Promise<XtreamEpgEntry[]> {
    try {
      const raw = await this.get<{
        epg_listings: Array<{
          id: string;
          title: string; // base64 encoded
          description: string; // base64 encoded
          start: string;
          end: string;
          lang: string;
        }>;
      }>('get_short_epg', { stream_id: streamId });

      if (!raw?.epg_listings || !Array.isArray(raw.epg_listings)) return [];

      return raw.epg_listings.map((e) => ({
        id: e.id ?? '',
        title: safeBase64Decode(e.title),
        description: safeBase64Decode(e.description),
        start: e.start ?? '',
        end: e.end ?? '',
        lang: e.lang ?? 'en',
      }));
    } catch {
      return [];
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Some Xtream providers base64-encode title/description fields.
 * Attempt decode; fall back to raw string.
 */
function safeBase64Decode(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf-8');
    // If decoded looks like readable text (printable ASCII/UTF), use it
    if (/^[\x20-\x7E\u00A0-\uFFFF]*$/.test(decoded) && decoded.length > 0) {
      return decoded;
    }
  } catch {
    // ignore
  }
  return value;
}

/**
 * Convenience: log and suppress network errors from Xtream calls.
 * Returns null on failure so callers can decide to skip.
 */
export async function tryXtreamCall<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    logger.warn({ err, label }, 'Xtream API call failed — skipping');
    return null;
  }
}
