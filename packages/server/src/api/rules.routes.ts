import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { logger } from '../logger.js';

export const rulesRouter = Router();

// ── Validation Schemas ──────────────────────────────────────

const uuidParamSchema = z.string().uuid();

const createSeriesRuleSchema = z.object({
  type: z.literal('SERIES'),
  channelId: z.string().uuid().nullable().optional(),
  seriesTitle: z.string().min(1).max(255),
  newOnly: z.enum(['ALL', 'NEW_ONLY']).optional().default('ALL'),
  priority: z.number().int().min(1).max(100).optional().default(50),
  keepLast: z.number().int().min(1).nullable().optional(),
  startEarly: z.number().int().min(0).optional().default(0),
  endLate: z.number().int().min(0).optional().default(0),
});

const createOnceRuleSchema = z.object({
  type: z.literal('ONCE'),
  channelId: z.string().uuid().optional(),  // stored for fallback matching
  programId: z.string().uuid(),
  priority: z.number().int().min(1).max(100).optional().default(50),
  startEarly: z.number().int().min(0).optional().default(0),
  endLate: z.number().int().min(0).optional().default(0),
});

const createManualRuleSchema = z.object({
  type: z.literal('MANUAL'),
  channelId: z.string().uuid(),
  manualStart: z.string().datetime(),
  manualEnd: z.string().datetime(),
  priority: z.number().int().min(1).max(100).optional().default(50),
});

const createRuleSchema = z.discriminatedUnion('type', [
  createSeriesRuleSchema,
  createOnceRuleSchema,
  createManualRuleSchema,
]);

const updateRuleSchema = z.object({
  seriesTitle: z.string().min(1).max(255).optional(),
  channelId: z.string().uuid().nullable().optional(),
  newOnly: z.enum(['ALL', 'NEW_ONLY']).optional(),
  priority: z.number().int().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  keepLast: z.number().int().min(1).nullable().optional(),
  startEarly: z.number().int().min(0).optional(),
  endLate: z.number().int().min(0).optional(),
});

// ── GET /api/v1/rules ───────────────────────────────────────

rulesRouter.get('/', async (_req, res, next) => {
  try {
    const rules = await db.recordingRule.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        channel: { select: { id: true, name: true, tvgLogo: true } },
        _count: { select: { recordings: true } },
      },
    });

    res.json({ data: rules });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/v1/rules/:id ───────────────────────────────────

rulesRouter.get('/:id', async (req, res, next) => {
  try {
    if (!uuidParamSchema.safeParse(req.params.id).success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid rule ID' },
      });
      return;
    }

    const rule = await db.recordingRule.findUnique({
      where: { id: req.params.id },
      include: {
        channel: { select: { id: true, name: true, tvgLogo: true } },
        recordings: {
          orderBy: { scheduledStart: 'desc' },
          take: 20,
          select: {
            id: true,
            title: true,
            subtitle: true,
            status: true,
            scheduledStart: true,
            scheduledEnd: true,
            season: true,
            episode: true,
          },
        },
      },
    });

    if (!rule) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Recording rule not found' },
      });
      return;
    }

    res.json({ data: rule });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/v1/rules ──────────────────────────────────────

rulesRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createRuleSchema.safeParse(req.body);
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

    // Validate references exist
    if (data.type === 'ONCE') {
      const program = await db.program.findUnique({ where: { id: data.programId } });
      if (!program) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Program not found' },
        });
        return;
      }
      // Ensure channelId is set from the program (authoritative source)
      (data as typeof data & { channelId: string }).channelId = program.channelId;
    }

    if ('channelId' in data && data.channelId) {
      const channel = await db.channel.findUnique({ where: { id: data.channelId } });
      if (!channel) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Channel not found' },
        });
        return;
      }
    }

    // Validate manual rule time range
    if (data.type === 'MANUAL') {
      const start = new Date(data.manualStart);
      const end = new Date(data.manualEnd);
      if (end <= start) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'manualEnd must be after manualStart' },
        });
        return;
      }
    }

    const rule = await db.recordingRule.create({
      data: {
        type: data.type,
        channelId: 'channelId' in data ? (data.channelId ?? null) : null,
        seriesTitle: data.type === 'SERIES' ? data.seriesTitle : null,
        programId: data.type === 'ONCE' ? data.programId : null,
        manualStart: data.type === 'MANUAL' ? new Date(data.manualStart) : null,
        manualEnd: data.type === 'MANUAL' ? new Date(data.manualEnd) : null,
        newOnly: data.type === 'SERIES' ? data.newOnly : 'ALL',
        priority: data.priority,
        keepLast: data.type === 'SERIES' ? (data.keepLast ?? null) : null,
        startEarly: 'startEarly' in data ? data.startEarly : 0,
        endLate: 'endLate' in data ? data.endLate : 0,
      },
      include: {
        channel: { select: { id: true, name: true, tvgLogo: true } },
      },
    });

    logger.info({ ruleId: rule.id, type: rule.type }, 'Recording rule created');

    res.status(201).json({ data: rule });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/v1/rules/:id ───────────────────────────────────

rulesRouter.put('/:id', async (req, res, next) => {
  try {
    if (!uuidParamSchema.safeParse(req.params.id).success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid rule ID' },
      });
      return;
    }

    const parsed = updateRuleSchema.safeParse(req.body);
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

    const existing = await db.recordingRule.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Recording rule not found' },
      });
      return;
    }

    // Validate channelId if changing
    if (parsed.data.channelId) {
      const channel = await db.channel.findUnique({ where: { id: parsed.data.channelId } });
      if (!channel) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Channel not found' },
        });
        return;
      }
    }

    const rule = await db.recordingRule.update({
      where: { id: req.params.id },
      data: parsed.data,
      include: {
        channel: { select: { id: true, name: true, tvgLogo: true } },
        _count: { select: { recordings: true } },
      },
    });

    logger.info({ ruleId: rule.id }, 'Recording rule updated');

    res.json({ data: rule });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/v1/rules/:id/preview ──────────────────────────
// Returns upcoming programs (next 14 days) that a SERIES rule would match.
// Each program includes: id, title, subtitle, startTime, endTime, season,
// episode, isNew, channelName, isScheduled (already has a recording).

rulesRouter.get('/:id/preview', async (req, res, next) => {
  try {
    if (!uuidParamSchema.safeParse(req.params.id).success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid rule ID' },
      });
      return;
    }

    const rule = await db.recordingRule.findUnique({ where: { id: req.params.id } });
    if (!rule) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Recording rule not found' },
      });
      return;
    }

    if (rule.type !== 'SERIES' || !rule.seriesTitle) {
      res.json({ data: [] });
      return;
    }

    const now = new Date();
    const lookahead = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const where: Record<string, unknown> = {
      title: { contains: rule.seriesTitle, mode: 'insensitive' },
      startTime: { gte: now, lte: lookahead },
    };

    if (rule.channelId) {
      where['channelId'] = rule.channelId;
    }

    if (rule.newOnly === 'NEW_ONLY') {
      where['isNew'] = true;
    }

    const programs = await db.program.findMany({
      where,
      orderBy: { startTime: 'asc' },
      include: { channel: { select: { id: true, name: true, tvgLogo: true } } },
    });

    if (programs.length === 0) {
      res.json({ data: [] });
      return;
    }

    // Annotate with existing recording status
    const programIds = programs.map((p) => p.id);
    const existingRecordings = await db.recording.findMany({
      where: {
        programId: { in: programIds },
        status: { in: ['SCHEDULED', 'RECORDING', 'POST_PROCESSING', 'COMPLETED', 'CANCELLED', 'FAILED'] },
      },
      select: { programId: true, status: true },
    });
    const recordingByProgramId = new Map(existingRecordings.map((r) => [r.programId, r.status]));

    const data = programs.map((p) => ({
      id: p.id,
      title: p.title,
      subtitle: p.subtitle,
      startTime: p.startTime.toISOString(),
      endTime: p.endTime.toISOString(),
      season: p.season,
      episode: p.episode,
      isNew: p.isNew,
      channel: p.channel,
      recordingStatus: recordingByProgramId.get(p.id) ?? null,
    }));

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/v1/rules/:id ────────────────────────────────

rulesRouter.delete('/:id', async (req, res, next) => {
  try {
    if (!uuidParamSchema.safeParse(req.params.id).success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid rule ID' },
      });
      return;
    }

    const existing = await db.recordingRule.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Recording rule not found' },
      });
      return;
    }

    // Delete rule only — existing recordings are preserved (ruleId set to null via onDelete: SetNull)
    await db.recordingRule.delete({ where: { id: req.params.id } });

    logger.info({ ruleId: req.params.id }, 'Recording rule deleted');

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
