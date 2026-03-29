import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { logger } from '../logger.js';
import { syncSource } from '../services/source-manager.js';

export const sourcesRouter = Router();

// ── Validation Schemas ──────────────────────────────────────

const createSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('M3U'),
    name: z.string().min(1).max(255),
    m3uUrl: z.string().url(),
    epgUrl: z.string().url().nullable().optional(),
    refreshDaily: z.boolean().optional().default(true),
  }),
  z.object({
    type: z.literal('XTREAM'),
    name: z.string().min(1).max(255),
    xcHost: z.string().url(),
    xcUsername: z.string().min(1),
    xcPassword: z.string().min(1),
    refreshDaily: z.boolean().optional().default(true),
  }),
]);

const updateSourceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  m3uUrl: z.string().url().optional(),
  epgUrl: z.string().url().nullable().optional(),
  xcHost: z.string().url().optional(),
  xcUsername: z.string().min(1).optional(),
  xcPassword: z.string().min(1).optional(),
  refreshDaily: z.boolean().optional(),
});

// ── GET /api/v1/sources ─────────────────────────────────────

sourcesRouter.get('/', async (_req, res, next) => {
  try {
    const sources = await db.source.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { channels: true } },
      },
    });

    res.json({ data: sources });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/v1/sources/:id ─────────────────────────────────

sourcesRouter.get('/:id', async (req, res, next) => {
  try {
    const source = await db.source.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { channels: true } },
      },
    });

    if (!source) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Source not found' },
      });
      return;
    }

    res.json({ data: source });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/v1/sources ────────────────────────────────────

sourcesRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createSourceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    const data = parsed.data;
    const source = await db.source.create({
      data: {
        name: data.name,
        type: data.type,
        m3uUrl: data.type === 'M3U' ? data.m3uUrl : undefined,
        epgUrl: data.type === 'M3U' ? (data.epgUrl ?? undefined) : undefined,
        xcHost: data.type === 'XTREAM' ? data.xcHost : undefined,
        xcUsername: data.type === 'XTREAM' ? data.xcUsername : undefined,
        xcPassword: data.type === 'XTREAM' ? data.xcPassword : undefined,
        refreshDaily: data.refreshDaily,
      },
    });

    logger.info({ sourceId: source.id, type: source.type }, 'Source created');

    // Auto-sync after creation
    try {
      const result = await syncSource(source.id);
      logger.info(
        { sourceId: source.id, channelCount: result.channelCount },
        'Initial source sync completed',
      );
    } catch (syncErr) {
      logger.warn(
        { sourceId: source.id, err: syncErr },
        'Initial source sync failed (source still created)',
      );
    }

    // Re-fetch with channel count
    const refreshed = await db.source.findUnique({
      where: { id: source.id },
      include: { _count: { select: { channels: true } } },
    });

    res.status(201).json({ data: refreshed });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/v1/sources/:id ─────────────────────────────────

sourcesRouter.put('/:id', async (req, res, next) => {
  try {
    const parsed = updateSourceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    const existing = await db.source.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Source not found' },
      });
      return;
    }

    const source = await db.source.update({
      where: { id: req.params.id },
      data: parsed.data,
      include: { _count: { select: { channels: true } } },
    });

    logger.info({ sourceId: source.id }, 'Source updated');
    res.json({ data: source });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/v1/sources/:id ──────────────────────────────

sourcesRouter.delete('/:id', async (req, res, next) => {
  try {
    const existing = await db.source.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Source not found' },
      });
      return;
    }

    await db.source.delete({ where: { id: req.params.id } });

    logger.info({ sourceId: req.params.id }, 'Source deleted');
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ── POST /api/v1/sources/:id/sync ───────────────────────────

sourcesRouter.post('/:id/sync', async (req, res, next) => {
  try {
    const existing = await db.source.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Source not found' },
      });
      return;
    }

    const result = await syncSource(req.params.id);

    res.json({
      data: {
        message: 'Sync completed',
        channelCount: result.channelCount,
      },
    });
  } catch (err) {
    next(err);
  }
});
