// packages/server/src/api/m3u-output.routes.ts

/**
 * M3U Output & HLS Serving Routes
 *
 * These routes are mounted at root level (NOT under /api/v1):
 * - GET /vod.m3u       — VOD playlist of completed recordings
 * - GET /live.m3u      — Live buffer playlist of in-progress recordings
 * - GET /recordings/:id/stream.m3u8 — HLS index for a specific recording
 * - GET /recordings/:id/segment_*.ts — Individual HLS segment file
 */

import { Router } from 'express';
import { join, resolve, sep } from 'node:path';
import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { z } from 'zod';
import { db } from '../db.js';
import { logger } from '../logger.js';
import { config } from '../config.js';

export const m3uOutputRouter = Router();

// ── Validation ──────────────────────────────────────────────

const uuidParamSchema = z.string().uuid();

// ── Cache state for M3U output (30s TTL per spec) ──────────

interface CacheEntry {
  content: string;
  expiresAt: number;
}

const m3uCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

function getCached(key: string): string | null {
  const entry = m3uCache.get(key);
  if (entry && Date.now() < entry.expiresAt) {
    return entry.content;
  }
  m3uCache.delete(key);
  return null;
}

function setCache(key: string, content: string): void {
  m3uCache.set(key, { content, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Invalidate the M3U output cache (call when recordings change state)
 */
export function invalidateM3uCache(): void {
  m3uCache.clear();
}

/**
 * Build the server base URL from the request or config.
 * Uses the Host header so M3U clients get a reachable URL.
 */
function getBaseUrl(req: { protocol: string; get: (name: string) => string | undefined }): string {
  const host = req.get('host') ?? `localhost:${config.port}`;
  const protocol = req.protocol;
  return `${protocol}://${host}`;
}

/**
 * Validate that a resolved path is within the recordings directory.
 * Prevents path traversal attacks.
 */
function isPathSafe(filePath: string): boolean {
  const resolvedPath = resolve(filePath);
  const allowedBase = resolve(config.recordingsPath);
  return resolvedPath.startsWith(allowedBase + sep) || resolvedPath === allowedBase;
}

// ── GET /vod.m3u ────────────────────────────────────────────

m3uOutputRouter.get('/vod.m3u', async (req, res, next) => {
  try {
    const cached = getCached('vod');
    if (cached) {
      res.set('Content-Type', 'audio/x-mpegurl');
      res.send(cached);
      return;
    }

    const recordings = await db.recording.findMany({
      where: { status: 'COMPLETED' },
      orderBy: [{ title: 'asc' }, { scheduledStart: 'asc' }],
      include: {
        channel: { select: { name: true, tvgLogo: true } },
      },
    });

    const baseUrl = getBaseUrl(req);
    let m3u = '#EXTM3U\n';

    for (const rec of recordings) {
      const episodeTag = formatEpisodeTag(rec.season, rec.episode);
      const displayName = rec.subtitle
        ? `${rec.title}${episodeTag} - ${rec.subtitle}`
        : `${rec.title}${episodeTag}`;

      const tvgName = rec.subtitle
        ? `${rec.title}${episodeTag}`
        : rec.title;

      m3u += `#EXTINF:${rec.duration ?? -1}`;
      m3u += ` tvg-id="${rec.id}"`;
      m3u += ` tvg-name="${tvgName}"`;
      if (rec.posterUrl) m3u += ` tvg-logo="${rec.posterUrl}"`;
      else if (rec.channel?.tvgLogo) m3u += ` tvg-logo="${rec.channel.tvgLogo}"`;
      m3u += ` group-title="${rec.title}"`;
      m3u += `,${displayName}\n`;
      m3u += `${baseUrl}/recordings/${rec.id}/stream.m3u8\n`;
    }

    setCache('vod', m3u);

    res.set('Content-Type', 'audio/x-mpegurl');
    res.send(m3u);
  } catch (err) {
    next(err);
  }
});

// ── GET /live.m3u ───────────────────────────────────────────

m3uOutputRouter.get('/live.m3u', async (req, res, next) => {
  try {
    const cached = getCached('live');
    if (cached) {
      res.set('Content-Type', 'audio/x-mpegurl');
      res.send(cached);
      return;
    }

    const recordings = await db.recording.findMany({
      where: { status: 'RECORDING' },
      orderBy: { actualStart: 'asc' },
      include: {
        channel: { select: { name: true, tvgLogo: true } },
      },
    });

    const baseUrl = getBaseUrl(req);
    let m3u = '#EXTM3U\n';

    for (const rec of recordings) {
      m3u += `#EXTINF:-1`;
      m3u += ` tvg-id="${rec.id}"`;
      m3u += ` tvg-name="${rec.title}"`;
      if (rec.channel?.tvgLogo) m3u += ` tvg-logo="${rec.channel.tvgLogo}"`;
      m3u += ` group-title="Recording Now"`;
      m3u += `,${rec.title} (Recording)\n`;
      m3u += `${baseUrl}/recordings/${rec.id}/stream.m3u8\n`;
    }

    setCache('live', m3u);

    res.set('Content-Type', 'audio/x-mpegurl');
    res.send(m3u);
  } catch (err) {
    next(err);
  }
});

// ── GET /recordings/:id/stream.m3u8 ────────────────────────

m3uOutputRouter.get('/recordings/:id/stream.m3u8', async (req, res, next) => {
  try {
    if (!uuidParamSchema.safeParse(req.params.id).success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid recording ID' },
      });
      return;
    }

    const recording = await db.recording.findUnique({
      where: { id: req.params.id },
    });

    if (!recording) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Recording not found' },
      });
      return;
    }

    if (recording.status === 'RECORDING' && recording.livePath) {
      // Serve live HLS index from disk
      const m3u8Path = join(config.recordingsPath, recording.livePath);

      try {
        const content = await readFile(m3u8Path, 'utf-8');
        res.set('Content-Type', 'application/vnd.apple.mpegurl');
        res.set('Cache-Control', 'no-cache');
        res.send(content);
      } catch (err) {
        logger.debug({ recordingId: req.params.id, m3u8Path, err }, 'HLS index not found on disk');
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'HLS index not found on disk' },
        });
      }
      return;
    }

    if (recording.status === 'COMPLETED' && recording.filePath) {
      // Generate a simple HLS playlist pointing to the single .ts file
      const duration = recording.duration ?? 0;
      const baseUrl = getBaseUrl(req);

      const m3u8 = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        `#EXT-X-TARGETDURATION:${duration}`,
        '#EXT-X-MEDIA-SEQUENCE:0',
        `#EXTINF:${duration},`,
        `${baseUrl}/recordings/${recording.id}/file.ts`,
        '#EXT-X-ENDLIST',
        '',
      ].join('\n');

      res.set('Content-Type', 'application/vnd.apple.mpegurl');
      res.send(m3u8);
      return;
    }

    if (recording.status === 'POST_PROCESSING' && recording.livePath) {
      // During post-processing, serve the finalized HLS (with ENDLIST)
      const m3u8Path = join(config.recordingsPath, recording.livePath);
      try {
        const content = await readFile(m3u8Path, 'utf-8');
        res.set('Content-Type', 'application/vnd.apple.mpegurl');
        res.send(content);
      } catch (err) {
        logger.debug({ recordingId: req.params.id, m3u8Path, err }, 'HLS index not found on disk');
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'HLS index not found on disk' },
        });
      }
      return;
    }

    res.status(404).json({
      error: { code: 'NOT_FOUND', message: `Recording status "${recording.status}" has no playable content` },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /recordings/:id/segment_*.ts ────────────────────────

m3uOutputRouter.get('/recordings/:id/:segment', async (req, res, next) => {
  try {
    const { id, segment } = req.params;

    // Validate UUID
    if (!uuidParamSchema.safeParse(id).success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid recording ID' },
      });
      return;
    }

    // Validate segment filename format to prevent path traversal
    // Supports up to 999999 segments (~1666 hours at 6s segments)
    if (!/^segment_\d{1,6}\.ts$/.test(segment)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid segment filename' },
      });
      return;
    }

    const recording = await db.recording.findUnique({
      where: { id },
    });

    if (!recording) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Recording not found' },
      });
      return;
    }

    // Determine file path based on status
    const segmentPath = join(config.recordingsPath, 'live', id, segment);

    // Security: verify path stays within recordings directory
    if (!isPathSafe(segmentPath)) {
      logger.warn({ recordingId: id, segment, segmentPath }, 'Path traversal attempt detected');
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
      return;
    }

    try {
      const fileStat = await stat(segmentPath);
      res.set('Content-Type', 'video/mp2t');
      res.set('Content-Length', String(fileStat.size));
      res.set('Cache-Control', 'public, max-age=31536000'); // Segments are immutable
      createReadStream(segmentPath).pipe(res);
    } catch {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Segment not found' },
      });
    }
  } catch (err) {
    next(err);
  }
});

// ── GET /recordings/:id/file.ts ─────────────────────────────
// Serve the completed single-file recording

m3uOutputRouter.get('/recordings/:id/file.ts', async (req, res, next) => {
  try {
    // Validate UUID
    if (!uuidParamSchema.safeParse(req.params.id).success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid recording ID' },
      });
      return;
    }

    const recording = await db.recording.findUnique({
      where: { id: req.params.id },
    });

    if (!recording || !recording.filePath) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Recording file not found' },
      });
      return;
    }

    const filePath = recording.filePath.startsWith('/')
      ? recording.filePath
      : join(config.recordingsPath, recording.filePath);

    // Security: verify resolved path stays within recordings directory
    if (!isPathSafe(filePath)) {
      logger.warn({ recordingId: req.params.id, filePath }, 'Path traversal attempt detected');
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
      return;
    }

    try {
      const fileStat = await stat(filePath);
      res.set('Content-Type', 'video/mp2t');
      res.set('Content-Length', String(fileStat.size));
      res.set('Accept-Ranges', 'bytes');
      createReadStream(filePath).pipe(res);
    } catch (err) {
      logger.debug({ recordingId: req.params.id, filePath, err }, 'Recording file not found on disk');
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Recording file not found on disk' },
      });
    }
  } catch (err) {
    next(err);
  }
});

// ── Helpers ─────────────────────────────────────────────────

function formatEpisodeTag(season: number | null, episode: number | null): string {
  if (season != null && episode != null) {
    return ` - S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
  }
  if (episode != null) {
    return ` - E${String(episode).padStart(2, '0')}`;
  }
  return '';
}
