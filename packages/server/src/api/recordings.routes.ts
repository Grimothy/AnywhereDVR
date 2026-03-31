import { Router } from 'express';
import { z } from 'zod';
import fs from 'fs/promises';
import { join } from 'path';
import { db } from '../db.js';
import { logger } from '../logger.js';
import { config } from '../config.js';
import { recorder } from '../services/recorder.js';
import { notificationManager } from '../services/notification-manager.js';

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
    if (status) {
      where.status = status;
    } else {
      // By default exclude CANCELLED tombstones (soft-deleted recordings).
      // A caller can still request them explicitly with ?status=CANCELLED.
      where.status = { not: 'CANCELLED' };
    }
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

// ── GET /api/v1/recordings/schedule/upcoming ────────────────
// Upcoming scheduled recordings (next 7 days)
// NOTE: Must be registered BEFORE /:id to avoid param shadowing

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

    // Delete files from disk (best-effort — log errors but don't block DB update)
    const relPaths = [recording.filePath, recording.sidecarPath, recording.edlPath].filter(Boolean) as string[];
    for (const relPath of relPaths) {
      const absPath = relPath.startsWith('/') ? relPath : join(config.recordingsPath, relPath);
      try {
        await fs.unlink(absPath);
        logger.info({ recordingId: req.params.id, absPath }, 'Deleted recording file');
      } catch (fileErr: unknown) {
        if ((fileErr as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.warn({ recordingId: req.params.id, absPath, err: fileErr }, 'Failed to delete recording file');
        }
      }
    }

    // Soft-delete: mark CANCELLED and clear file paths rather than removing the row.
    // This prevents the scheduler from re-scheduling the same program on the next tick,
    // since the dedup check includes CANCELLED status.
    await db.recording.update({
      where: { id: req.params.id },
      data: {
        status: 'CANCELLED',
        errorMessage: 'Deleted by user',
        filePath: null,
        sidecarPath: null,
        edlPath: null,
        livePath: null,
        fileSize: null,
        duration: null,
        ffmpegPid: null,
      },
    });

    logger.info({ recordingId: req.params.id }, 'Recording deleted (soft)');

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

    if (recording.status === 'RECORDING' && recorder.isActive(recording.id)) {
      // Stop ffmpeg immediately — recorder.cancel() handles graceful shutdown,
      // sets status to CANCELLED, and removes it from the active map.
      // Run async; respond immediately so the UI doesn't block for 10s.
      recorder.cancel(recording.id).catch((err) => {
        logger.error({ recordingId: recording.id, err }, 'Error during recording cancel');
      });

      logger.info({ recordingId: recording.id }, 'Cancel initiated — stopping ffmpeg');

      // Emit cancellation event immediately so UI updates without waiting for the scheduler tick
      notificationManager.socketEmit('recording:cancelled', { recordingId: recording.id });

      res.json({ data: serializeRecording({ ...recording, status: 'CANCELLED' }) });
      return;
    }

    // SCHEDULED (not yet started) — just mark cancelled in DB
    const updated = await db.recording.update({
      where: { id: req.params.id },
      data: {
        status: 'CANCELLED',
        errorMessage: 'Cancelled by user',
      },
    });

    logger.info({ recordingId: req.params.id }, 'Scheduled recording cancelled');

    res.json({ data: serializeRecording(updated) });
  } catch (err) {
    next(err);
  }
});
