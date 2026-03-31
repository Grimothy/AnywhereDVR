// packages/server/src/api/notifications.routes.ts

import { Router } from 'express';
import { z } from 'zod';
import { notificationManager } from '../services/notification-manager.js';
import { logger } from '../logger.js';

export const notificationsRouter = Router();

const uuidParamSchema = z.string().uuid();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  unreadOnly: z.coerce.boolean().default(false),
});

// ── GET /api/v1/notifications ────────────────────────────────────────────────

notificationsRouter.get('/', async (req, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters', details: parsed.error.flatten() },
      });
      return;
    }

    const { limit } = parsed.data;
    const notifications = await notificationManager.list(limit);

    res.json({
      data: notifications,
      meta: { total: notifications.length },
    });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/v1/notifications/:id/read ──────────────────────────────────────

notificationsRouter.put('/:id/read', async (req, res, next) => {
  try {
    if (!uuidParamSchema.safeParse(req.params.id).success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid notification ID' } });
      return;
    }

    await notificationManager.markRead(req.params.id);
    logger.info({ notificationId: req.params.id }, 'Notification marked read');

    res.json({ data: { id: req.params.id, read: true } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/v1/notifications/read-all ─────────────────────────────────────
// Must be registered BEFORE /:id to avoid param shadowing

notificationsRouter.post('/read-all', async (_req, res, next) => {
  try {
    await notificationManager.markAllRead();
    logger.info('All notifications marked read');

    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
});
