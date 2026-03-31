import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { logger } from '../logger.js';

export const settingsRouter = Router();

// All known setting keys and their types
const SETTING_SCHEMA = z.object({
  maxConcurrentStreams:      z.coerce.number().int().min(1).max(20).optional(),
  globalDiskQuotaGB:        z.coerce.number().int().min(1).optional(),
  recordingsBasePath:       z.string().min(1).optional(),
  startEarlySeconds:        z.coerce.number().int().min(0).max(3600).optional(),
  endLateSeconds:           z.coerce.number().int().min(0).max(3600).optional(),
  epgRefreshIntervalHours:  z.coerce.number().int().min(1).max(168).optional(),
  sourceRefreshIntervalHours: z.coerce.number().int().min(1).max(168).optional(),
  enableComskip:            z.enum(['true', 'false']).optional(),
  enableTmdbEnrichment:     z.enum(['true', 'false']).optional(),
  tmdbApiKey:               z.string().optional(),
  ffmpegPath:               z.string().min(1).optional(),
  comskipPath:              z.string().min(1).optional(),
});

// ── GET /api/v1/settings ────────────────────────────────────

settingsRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await db.setting.findMany();
    const settings: Record<string, string> = {};
    rows.forEach((r) => { settings[r.key] = r.value; });
    res.json({ data: settings });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/v1/settings ────────────────────────────────────

settingsRouter.put('/', async (req, res, next) => {
  try {
    const parsed = SETTING_SCHEMA.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid settings',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    const updates = parsed.data;

    // Upsert each provided key
    await Promise.all(
      Object.entries(updates)
        .filter(([, v]) => v !== undefined)
        .map(([key, value]) =>
          db.setting.upsert({
            where: { key },
            update: { value: String(value) },
            create: { key, value: String(value) },
          }),
        ),
    );

    logger.info({ keys: Object.keys(updates) }, 'Settings updated');

    // Return all current settings
    const rows = await db.setting.findMany();
    const settings: Record<string, string> = {};
    rows.forEach((r) => { settings[r.key] = r.value; });

    res.json({ data: settings });
  } catch (err) {
    next(err);
  }
});
