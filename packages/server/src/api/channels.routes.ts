import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';

export const channelsRouter = Router();

// ── Validation Schemas ──────────────────────────────────────

const listQuerySchema = z.object({
  sourceId: z.string().uuid().optional(),
  groupTitle: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(200).default(50),
});

// ── GET /api/v1/channels ────────────────────────────────────

channelsRouter.get('/', async (req, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
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

    const { sourceId, groupTitle, search, page, perPage } = parsed.data;

    // Build where clause
    const where: Record<string, unknown> = { isActive: true };
    if (sourceId) where.sourceId = sourceId;
    if (groupTitle) where.groupTitle = groupTitle;
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [channels, total] = await Promise.all([
      db.channel.findMany({
        where,
        orderBy: [
          { channelNumber: { sort: 'asc', nulls: 'last' } },
          { name: 'asc' },
        ],
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          source: { select: { id: true, name: true } },
        },
      }),
      db.channel.count({ where }),
    ]);

    res.json({
      data: channels,
      meta: { page, perPage, total },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/v1/channels/search ─────────────────────────────

channelsRouter.get('/search', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    if (!q || q.length < 2) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Search query "q" must be at least 2 characters',
        },
      });
      return;
    }

    const channels = await db.channel.findMany({
      where: {
        isActive: true,
        name: { contains: q, mode: 'insensitive' },
      },
      orderBy: { name: 'asc' },
      take: 50,
      include: {
        source: { select: { id: true, name: true } },
      },
    });

    res.json({ data: channels });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/v1/channels/:id ────────────────────────────────

channelsRouter.get('/:id', async (req, res, next) => {
  try {
    const channel = await db.channel.findUnique({
      where: { id: req.params.id },
      include: {
        source: { select: { id: true, name: true, type: true } },
      },
    });

    if (!channel) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Channel not found' },
      });
      return;
    }

    res.json({ data: channel });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/v1/channels/groups ─────────────────────────────

channelsRouter.get('/groups/list', async (_req, res, next) => {
  try {
    // Aggregate channel count per group, excluding null groups
    const groups = await db.channel.groupBy({
      by: ['groupTitle'],
      where: {
        isActive: true,
        groupTitle: { not: null },
      },
      _count: { id: true },
      orderBy: { groupTitle: 'asc' },
    });

    res.json({
      data: groups.map((g) => ({
        name: g.groupTitle,
        count: g._count.id,
      })),
    });
  } catch (err) {
    next(err);
  }
});
