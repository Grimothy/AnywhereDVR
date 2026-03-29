import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { logger } from '../logger.js';

export const recordingsRouter = Router();

// ── Validation Schemas ──────────────────────────────────────

const uuidParamSchema = z.string().uuid();

const listQuerySchema = z.object({
  status: z.enum(['SCHEDULED', 'RECORDING', 'POST_PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED']).optional(),
  title: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(200).default(50),
});

// ── Helpers ─────────────────────────────────────────────────

/**
 * Serialize a recording for JSON response.
 * Converts BigInt fileSize to string (JSON can't serialize BigInt).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeRecording(recording: any): unknown {
  if (!recording) return recording;
  return {
    ...recording,
    fileSize: recording.fileSize != null ? recording.fileSize.toString() : null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeRecordings(recordings: any[]): unknown[] {
  return recordings.map(serializeRecording);
}

// ── GET /api/v1/recordings ──────────────────────────────────

recordingsRouter.get('/', async (req, res, next) => {
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

    const { status, title, page, perPage } = parsed.data;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (title) where.title = { contains: title, mode: 'insensitive' };

    const [recordings, total] = await Promise.all([
      db.recording.findMany({
        where,
        orderBy: { scheduledStart: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          channel: { select: { id: true, name: true, tvgLogo: true } },
          rule: { select: { id: true, type: true, seriesTitle: true } },
        },
      }),
      db.recording.count({ where }),
    ]);

    res.json({
      data: serializeRecordings(recordings),
      meta: { page, perPage, total },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/v1/recordings/:id ──────────────────────────────

recordingsRouter.get('/:id', async (req, res, next) => {
  try {
    if (!uuidParamSchema.safeParse(req.params.id).success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid recording ID' },
      });
      return;
    }

    const recording = await db.recording.findUnique({
      where: { id: req.params.id },
      include: {
        channel: { select: { id: true, name: true, tvgLogo: true } },
        rule: { select: { id: true, type: true, seriesTitle: true } },
        program: {
          select: {
            id: true,
            title: true,
            subtitle: true,
            description: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    if (!recording) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Recording not found' },
      });
      return;
    }

    res.json({ data: serializeRecording(recording) });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/v1/recordings/:id ───────────────────────────

recordingsRouter.delete('/:id', async (req, res, next) => {
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

    // Do not allow deleting in-progress recordings — must cancel first
    if (recording.status === 'RECORDING') {
      res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: 'Cannot delete an in-progress recording. Cancel it first.',
        },
      });
      return;
    }

    // TODO: Phase 4 — delete files from disk (filePath, sidecarPath, edlPath)
    await db.recording.delete({ where: { id: req.params.id } });

    logger.info({ recordingId: req.params.id }, 'Recording deleted');

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ── POST /api/v1/recordings/:id/cancel ──────────────────────

recordingsRouter.post('/:id/cancel', async (req, res, next) => {
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

    if (recording.status !== 'SCHEDULED' && recording.status !== 'RECORDING') {
      res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: `Cannot cancel a recording with status "${recording.status}"`,
        },
      });
      return;
    }

    // If recording is active, the recorder needs to stop ffmpeg
    // The scheduler/recorder will check for CANCELLED status and handle cleanup
    const updated = await db.recording.update({
      where: { id: req.params.id },
      data: {
        status: 'CANCELLED',
        errorMessage: 'Cancelled by user',
      },
    });

    logger.info({ recordingId: req.params.id, wasRecording: recording.status === 'RECORDING' }, 'Recording cancelled');

    res.json({ data: serializeRecording(updated) });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/v1/recordings/schedule/upcoming ────────────────
// Upcoming scheduled recordings (next 7 days)

recordingsRouter.get('/schedule/upcoming', async (_req, res, next) => {
  try {
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const upcoming = await db.recording.findMany({
      where: {
        status: { in: ['SCHEDULED', 'RECORDING'] },
        scheduledStart: { lte: weekFromNow },
      },
      orderBy: { scheduledStart: 'asc' },
      include: {
        channel: { select: { id: true, name: true, tvgLogo: true } },
        rule: { select: { id: true, type: true, seriesTitle: true } },
      },
    });

    res.json({ data: serializeRecordings(upcoming) });
  } catch (err) {
    next(err);
  }
});
