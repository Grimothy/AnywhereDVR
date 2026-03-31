import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { epgManager } from '../services/epg-manager.js';
import { EpgChannelPrograms, EpgProgram } from '../types/epg.js';
import { normalizeTitle } from '../services/metadata-enricher.js';

export const epgRouter = Router();

// ── In-memory EPG guide cache (30 s TTL) ────────────────────
// Key: "<startISO>|<endISO>|<sortedChannelIds>" → { data, expiresAt }
interface CacheEntry {
  data: ReturnType<typeof buildGuideResponse>;
  expiresAt: number;
}
const guideCache = new Map<string, CacheEntry>();
const GUIDE_CACHE_TTL_MS = 30_000;

function buildGuideResponse(channels: EpgChannelPrograms[], startTime: Date, endTime: Date) {
  return {
    data: { channels },
    meta: {
      start: startTime.toISOString(),
      end: endTime.toISOString(),
      channelCount: channels.length,
      programCount: channels.reduce((sum, ch) => sum + ch.programs.length, 0),
    },
  };
}

// ── Validation Schemas ──────────────────────────────────────

const epgQuerySchema = z.object({
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  channelIds: z.string().optional(), // comma-separated UUIDs
});

// ── GET /api/v1/epg ─────────────────────────────────────────
// Get EPG data for a time range, optionally filtered by channel IDs

epgRouter.get('/', async (req, res, next) => {
  try {
    const parsed = epgQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    const { start, end, channelIds } = parsed.data;

    // Default time range: now → now + 24h
    const startTime = start ? new Date(start) : new Date();
    const endTime = end ? new Date(end) : new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Parse and sort channelIds for stable cache keys
    const channelIdArray = channelIds
      ? channelIds.split(',').map(id => id.trim()).filter(id => id.length > 0).sort()
      : undefined;

    // Check cache
    const cacheKey = `${startTime.toISOString()}|${endTime.toISOString()}|${channelIdArray?.join(',') ?? '*'}`;
    const cached = guideCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }

    // Build where clause
    const where: Record<string, unknown> = {
      // Include any program that overlaps the requested window.
      // Fully-contained filtering leaves gaps at boundaries in compact guide views.
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    };

    if (channelIdArray && channelIdArray.length > 0) {
      where.channelId = { in: channelIdArray };
    }

    // Fetch programs first (recordings + metadata depend on the result)
    const programs = await db.program.findMany({
      where,
      include: {
        channel: {
          select: {
            id: true,
            name: true,
            tvgLogo: true,
          },
        },
      },
      orderBy: [
        { channelId: 'asc' },
        { startTime: 'asc' },
      ],
    });

    // Fetch recordings and metadata in parallel — neither depends on the other
    const uniqueTitles = [...new Set(programs.map(p => normalizeTitle(p.title)).filter(Boolean))];

    const [overlappingRecordings, metadataRecords] = await Promise.all([
      db.recording.findMany({
        where: {
          scheduledStart: { lt: endTime },
          scheduledEnd:   { gt: startTime },
          status: { in: ['SCHEDULED', 'RECORDING'] },
        },
        select: {
          id: true,
          programId: true,
          status: true,
          channelId: true,
          scheduledStart: true,
          scheduledEnd: true,
        },
      }),
      db.showMetadata.findMany({
        where: { title: { in: uniqueTitles } },
        select: {
          title: true,
          posterUrl: true,
          backdropUrl: true,
          logoUrl: true,
          overview: true,
          genres: true,
        },
      }),
    ]);

    // Build lookup: programId → recording
    const recordingByProgramId = new Map(
      overlappingRecordings.filter(r => r.programId).map(r => [r.programId!, r])
    );

    const metadataByNormalizedTitle = new Map(metadataRecords.map(m => [m.title, m]));

    // Build enriched program object
    function buildEpgProgram(prog: typeof programs[number]): EpgProgram {
      const rec = recordingByProgramId.get(prog.id);
      const meta = metadataByNormalizedTitle.get(normalizeTitle(prog.title));
      return {
        id: prog.id,
        title: prog.title,
        subtitle: prog.subtitle,
        description: prog.description,
        startTime: prog.startTime.toISOString(),
        endTime: prog.endTime.toISOString(),
        season: prog.season,
        episode: prog.episode,
        category: prog.category,
        isNew: prog.isNew,
        isScheduled: rec != null,
        isRecording: rec?.status === 'RECORDING',
        recordingId: rec?.id ?? null,
        posterUrl: meta?.posterUrl ?? null,
        backdropUrl: meta?.backdropUrl ?? null,
        logoUrl: meta?.logoUrl ?? null,
        overview: meta?.overview ?? null,
        genres: meta?.genres ?? [],
      };
    }

    // Group by channel
    const channelMap = new Map<string, EpgChannelPrograms>();

    for (const prog of programs) {
      const channelId = prog.channel.id;

      if (!channelMap.has(channelId)) {
        channelMap.set(channelId, {
          channelId,
          channelName: prog.channel.name,
          channelLogo: prog.channel.tvgLogo,
          programs: [],
        });
      }

      channelMap.get(channelId)!.programs.push(buildEpgProgram(prog));
    }

    const channels = Array.from(channelMap.values());

    const response = buildGuideResponse(channels, startTime, endTime);
    guideCache.set(cacheKey, { data: response, expiresAt: Date.now() + GUIDE_CACHE_TTL_MS });
    res.json(response);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/v1/epg/search ─────────────────────────────────
// Search upcoming programs by title

const epgSearchSchema = z.object({
  q: z.string().min(2, 'Query must be at least 2 characters'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

epgRouter.get('/search', async (req, res, next) => {
  try {
    const parsed = epgSearchSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    const { q, limit } = parsed.data;
    const now = new Date();

    // Search upcoming programs by title (ILIKE contains)
    const programs = await db.program.findMany({
      where: {
        title: { contains: q, mode: 'insensitive' },
        startTime: { gte: now },
      },
      include: {
        channel: {
          select: {
            id: true,
            name: true,
            tvgLogo: true,
            channelNumber: true,
            groupTitle: true,
          },
        },
      },
      orderBy: { startTime: 'asc' },
      take: limit,
    });

    // Fetch recordings that overlap these programs
    const programIds = programs.map(p => p.id);
    const recordings = await db.recording.findMany({
      where: {
        programId: { in: programIds },
        status: { in: ['SCHEDULED', 'RECORDING'] },
      },
      select: { id: true, programId: true, status: true },
    });
    const recordingByProgramId = new Map(
      recordings.filter(r => r.programId).map(r => [r.programId!, r])
    );

    // TMDB enrichment
    const uniqueTitles = [...new Set(programs.map(p => normalizeTitle(p.title)).filter(Boolean))];
    const metadataRecords = await db.showMetadata.findMany({
      where: { title: { in: uniqueTitles } },
      select: {
        title: true,
        posterUrl: true,
        backdropUrl: true,
        logoUrl: true,
        overview: true,
        genres: true,
      },
    });
    const metadataByNormalizedTitle = new Map(metadataRecords.map(m => [m.title, m]));

    const results = programs.map(prog => {
      const rec = recordingByProgramId.get(prog.id);
      const meta = metadataByNormalizedTitle.get(normalizeTitle(prog.title));
      return {
        id: prog.id,
        channelId: prog.channel.id,
        channelName: prog.channel.name,
        channelLogo: prog.channel.tvgLogo ?? null,
        channelNumber: prog.channel.channelNumber ?? null,
        groupTitle: prog.channel.groupTitle ?? null,
        title: prog.title,
        subtitle: prog.subtitle ?? null,
        description: prog.description ?? null,
        startTime: prog.startTime.toISOString(),
        endTime: prog.endTime.toISOString(),
        season: prog.season ?? null,
        episode: prog.episode ?? null,
        category: prog.category ?? null,
        isNew: prog.isNew,
        isScheduled: rec != null,
        isRecording: rec?.status === 'RECORDING',
        recordingId: rec?.id ?? null,
        posterUrl: meta?.posterUrl ?? null,
        backdropUrl: meta?.backdropUrl ?? null,
        logoUrl: meta?.logoUrl ?? null,
        overview: meta?.overview ?? null,
        genres: meta?.genres ?? [],
      };
    });

    res.json({
      data: { programs: results },
      meta: { count: results.length, query: q },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/v1/epg/:channelId ─────────────────────────────
// Get EPG for a specific channel

epgRouter.get('/:channelId', async (req, res, next) => {
  try {
    const { channelId } = req.params;

    // Validate UUID
    const uuidSchema = z.string().uuid();
    const parseResult = uuidSchema.safeParse(channelId);
    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid channel ID',
        },
      });
      return;
    }

    // Check if channel exists
    const channel = await db.channel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Channel not found',
        },
      });
      return;
    }

    // Get programs for next 7 days
    const now = new Date();
    const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const programs = await db.program.findMany({
      where: {
        channelId,
        startTime: { lt: endDate },
        endTime: { gt: now },
      },
      orderBy: { startTime: 'asc' },
    });

    // Fetch scheduled/active recordings for this channel in the same window
    const recordings = await db.recording.findMany({
      where: {
        channelId,
        scheduledStart: { lt: endDate },
        scheduledEnd:   { gt: now },
        status: { in: ['SCHEDULED', 'RECORDING'] },
      },
      select: { id: true, programId: true, status: true },
    });

    const recordingByProgramId = new Map(
      recordings.filter(r => r.programId).map(r => [r.programId!, r])
    );

    // Fetch enrichment metadata for all unique show titles
    const uniqueTitles = [...new Set(programs.map(p => normalizeTitle(p.title)).filter(Boolean))];
    const metadataRecords = await db.showMetadata.findMany({
      where: { title: { in: uniqueTitles } },
      select: {
        title: true,
        posterUrl: true,
        backdropUrl: true,
        logoUrl: true,
        overview: true,
        genres: true,
      },
    });
    const metadataByNormalizedTitle = new Map(metadataRecords.map(m => [m.title, m]));

    res.json({
      data: {
        channelId: channel.id,
        channelName: channel.name,
        channelLogo: channel.tvgLogo,
        programs: programs.map(prog => {
          const rec = recordingByProgramId.get(prog.id);
          const meta = metadataByNormalizedTitle.get(normalizeTitle(prog.title));
          return {
            id: prog.id,
            title: prog.title,
            subtitle: prog.subtitle,
            description: prog.description,
            startTime: prog.startTime.toISOString(),
            endTime: prog.endTime.toISOString(),
            season: prog.season,
            episode: prog.episode,
            category: prog.category,
            isNew: prog.isNew,
            isScheduled: rec != null,
            isRecording: rec?.status === 'RECORDING',
            recordingId: rec?.id ?? null,
            posterUrl: meta?.posterUrl ?? null,
            backdropUrl: meta?.backdropUrl ?? null,
            logoUrl: meta?.logoUrl ?? null,
            overview: meta?.overview ?? null,
            genres: meta?.genres ?? [],
          };
        }),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/v1/epg/refresh ────────────────────────────────
// Trigger manual EPG refresh for all sources

epgRouter.post('/refresh', async (req, res, next) => {
  try {
    // Trigger refresh asynchronously
    const result = await epgManager.refreshAll();

    res.json({
      data: {
        message: 'EPG refresh completed',
        success: result.success,
        failed: result.failed,
      },
    });
  } catch (err) {
    next(err);
  }
});
