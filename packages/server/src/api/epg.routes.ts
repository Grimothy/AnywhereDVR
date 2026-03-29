import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { epgManager } from '../services/epg-manager.js';
import { EpgChannelPrograms } from '../types/epg.js';

export const epgRouter = Router();

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

    // Parse channelIds filter
    const channelIdArray = channelIds
      ? channelIds.split(',').map(id => id.trim()).filter(id => id.length > 0)
      : undefined;

    // Build where clause
    const where: Record<string, unknown> = {
      startTime: { gte: startTime },
      endTime: { lte: endTime },
    };

    if (channelIdArray && channelIdArray.length > 0) {
      where.channelId = { in: channelIdArray };
    }

    // Fetch programs with channel data
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

      channelMap.get(channelId)!.programs.push({
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
        isScheduled: false, // TODO: Check against recording rules (Phase 3)
        isRecording: false, // TODO: Check against active recordings (Phase 3)
        recordingId: null,  // TODO: Link to recording if exists (Phase 3)
      });
    }

    const channels = Array.from(channelMap.values());

    res.json({
      data: { channels },
      meta: {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        channelCount: channels.length,
        programCount: programs.length,
      },
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
        startTime: { gte: now },
        endTime: { lte: endDate },
      },
      orderBy: { startTime: 'asc' },
    });

    res.json({
      data: {
        channelId: channel.id,
        channelName: channel.name,
        channelLogo: channel.tvgLogo,
        programs: programs.map(prog => ({
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
          isScheduled: false, // TODO: Phase 3
          isRecording: false, // TODO: Phase 3
          recordingId: null,  // TODO: Phase 3
        })),
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
