// packages/server/src/api/m3u-output.routes.ts

/**
 * M3U Output & HLS Serving Routes
 *
 * These routes are mounted at root level (NOT under /api/v1):
 * - GET /vod.m3u       — VOD playlist of completed recordings
 * - GET /live.m3u      — Live buffer playlist of in-progress recordings
 * - GET /recordings/:id/stream.m3u8 — HLS index for a specific recording
 * - GET /recordings/:id/segment_*.ts — Individual HLS segment file
 *
 * Auth:
 * - If ?token=<playlistToken> is provided, validates against User.playlistToken
 * - If user.requireToken is false, the playlist is publicly accessible
 * - HLS segment/stream serving is always public (URLs are opaque UUIDs)
 */

import { Router } from 'express';
import { join, resolve, sep } from 'node:path';
import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { z } from 'zod';
import { db } from '../db.js';
import { logger } from '../logger.js';
import { config } from '../config.js';
import { verifyToken, COOKIE_NAME } from '../auth/jwt.js';
import type { Request, Response, NextFunction } from 'express';

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

// ── Playlist auth helper ─────────────────────────────────────
// Resolves the requesting user from ?token= query param or JWT cookie.
// Returns null if no valid identity found (public access permitted unless requireToken).

interface PlaylistIdentity {
  userId: string;
  role: 'ADMIN' | 'USER';
  assignedGroups: string[];
  requireToken: boolean;
}

async function resolvePlaylistIdentity(req: Request): Promise<PlaylistIdentity | null> {
  // 1. Try ?token= query param (for external media players)
  const queryToken = req.query.token as string | undefined;
  if (queryToken) {
    const user = await db.user.findUnique({ where: { playlistToken: queryToken } });
    if (user && user.isActive) {
      return {
        userId: user.id,
        role: user.role,
        assignedGroups: user.assignedGroups,
        requireToken: user.requireToken,
      };
    }
    return null; // invalid token
  }

  // 2. Try JWT cookie (for web app)
  const jwtToken = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (jwtToken) {
    const payload = verifyToken(jwtToken);
    if (payload) {
      const user = await db.user.findUnique({ where: { id: payload.sub } });
      if (user && user.isActive) {
        return {
          userId: user.id,
          role: user.role,
          assignedGroups: user.assignedGroups,
          requireToken: user.requireToken,
        };
      }
    }
  }

  return null; // unauthenticated
}

// ── Playlist access guard ────────────────────────────────────
// Middleware that checks if the playlist endpoint requires a token.
// Admin and token-holders always get through; unauthenticated users are blocked
// if ANY user has requireToken=true (global policy) OR if no users exist yet.

async function requirePlaylistAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const identity = await resolvePlaylistIdentity(req);

    if (!identity) {
      // Check if global auth is required — if any user exists with requireToken, enforce
      const needsToken = await db.user.count({ where: { requireToken: true } });
      if (needsToken > 0) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Playlist token required' } });
        return;
      }
      // Open access — proceed without attaching identity
      next();
      return;
    }

    // Attach identity to req for downstream use
    (req as Request & { playlistIdentity?: PlaylistIdentity }).playlistIdentity = identity;
    next();
  } catch (err) {
    next(err);
  }
}

// ── GET /vod.m3u ────────────────────────────────────────────

m3uOutputRouter.get('/vod.m3u', requirePlaylistAuth, async (req, res, next) => {
  try {
    const identity = (req as Request & { playlistIdentity?: PlaylistIdentity }).playlistIdentity;

    // Build cache key based on user identity so each user gets their own filtered playlist
    const cacheKey = identity ? `vod:${identity.userId}` : 'vod:public';
    const cached = getCached(cacheKey);
    if (cached) {
      res.set('Content-Type', 'audio/x-mpegurl');
      res.send(cached);
      return;
    }

    const recordings = await db.recording.findMany({
      where: { status: 'COMPLETED' },
      orderBy: [{ title: 'asc' }, { scheduledStart: 'asc' }],
      include: {
        channel: { select: { name: true, tvgLogo: true, groupTitle: true } },
      },
    });

    // Filter by user's assigned groups if not admin
    const filtered = (identity && identity.role !== 'ADMIN' && identity.assignedGroups.length > 0)
      ? recordings.filter(rec => {
          const group = rec.channel?.groupTitle ?? '';
          return identity.assignedGroups.includes(group);
        })
      : recordings;

    const baseUrl = getBaseUrl(req);
    let m3u = '#EXTM3U\n';

    for (const rec of filtered) {
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

    setCache(cacheKey, m3u);

    res.set('Content-Type', 'audio/x-mpegurl');
    res.send(m3u);
  } catch (err) {
    next(err);
  }
});

// ── GET /live.m3u ───────────────────────────────────────────

m3uOutputRouter.get('/live.m3u', requirePlaylistAuth, async (req, res, next) => {
  try {
    const identity = (req as Request & { playlistIdentity?: PlaylistIdentity }).playlistIdentity;
    const cacheKey = identity ? `live:${identity.userId}` : 'live:public';

    const cached = getCached(cacheKey);
    if (cached) {
      res.set('Content-Type', 'audio/x-mpegurl');
      res.send(cached);
      return;
    }

    const recordings = await db.recording.findMany({
      where: { status: 'RECORDING' },
      orderBy: { actualStart: 'asc' },
      include: {
        channel: { select: { name: true, tvgLogo: true, groupTitle: true } },
      },
    });

    // Filter by user's assigned groups if not admin
    const filtered = (identity && identity.role !== 'ADMIN' && identity.assignedGroups.length > 0)
      ? recordings.filter(rec => {
          const group = rec.channel?.groupTitle ?? '';
          return identity.assignedGroups.includes(group);
        })
      : recordings;

    const baseUrl = getBaseUrl(req);
    let m3u = '#EXTM3U\n';

    for (const rec of filtered) {
      m3u += `#EXTINF:-1`;
      m3u += ` tvg-id="${rec.id}"`;
      m3u += ` tvg-name="${rec.title}"`;
      if (rec.channel?.tvgLogo) m3u += ` tvg-logo="${rec.channel.tvgLogo}"`;
      m3u += ` group-title="Recording Now"`;
      m3u += `,${rec.title} (Recording)\n`;
      m3u += `${baseUrl}/recordings/${rec.id}/stream.m3u8\n`;
    }

    setCache(cacheKey, m3u);

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

// ── GET /recordings/:id/file.ts ─────────────────────────────
// Serve the completed single-file recording
// IMPORTANT: Must be registered BEFORE /:segment wildcard to avoid being shadowed

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
