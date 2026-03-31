// packages/server/src/api/users.routes.ts
// User management (admin only) — CRUD, quota, channel assignment, playlist tokens

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db.js';
import { logger } from '../logger.js';
import { requireAuth, requireAdmin } from '../auth/middleware.js';

export const usersRouter = Router();

// All user management routes require auth + admin
usersRouter.use(requireAuth, requireAdmin);

// ── Helpers ──────────────────────────────────────────────────

function safeUser(user: {
  id: string;
  username: string;
  role: string;
  storageQuotaGB: number | null;
  assignedSourceIds: string[];
  assignedGroups: string[];
  playlistToken: string | null;
  requireToken: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    storageQuotaGB: user.storageQuotaGB,
    assignedSourceIds: user.assignedSourceIds,
    assignedGroups: user.assignedGroups,
    playlistToken: user.playlistToken,
    requireToken: user.requireToken,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function generatePlaylistToken(): string {
  return randomBytes(24).toString('hex');
}

// ── GET /api/v1/users ────────────────────────────────────────

usersRouter.get('/', async (_req, res, next) => {
  try {
    const users = await db.user.findMany({
      orderBy: { createdAt: 'asc' },
    });
    res.json({ data: users.map(safeUser) });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/v1/users/:id ────────────────────────────────────

const uuidSchema = z.string().uuid();

usersRouter.get('/:id', async (req, res, next) => {
  try {
    if (!uuidSchema.safeParse(req.params.id).success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid user ID' } });
      return;
    }
    const user = await db.user.findUnique({ where: { id: req.params.id } });
    if (!user) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      return;
    }
    res.json({ data: safeUser(user) });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/v1/users ───────────────────────────────────────

const createUserSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username may only contain letters, numbers, _ and -'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['ADMIN', 'USER']).default('USER'),
  storageQuotaGB: z.number().int().positive().nullable().optional(),
  assignedSourceIds: z.array(z.string()).default([]),
  assignedGroups: z.array(z.string()).default([]),
  requireToken: z.boolean().default(false),
});

usersRouter.post('/', async (req, res, next) => {
  try {
    const body = createUserSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: body.error.issues[0]?.message ?? 'Invalid input' },
      });
      return;
    }

    const { username, password, role, storageQuotaGB, assignedSourceIds, assignedGroups, requireToken } = body.data;

    // Check uniqueness
    const existing = await db.user.findUnique({ where: { username } });
    if (existing) {
      res.status(409).json({ error: { code: 'CONFLICT', message: 'Username already taken' } });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const playlistToken = generatePlaylistToken();

    const user = await db.user.create({
      data: {
        username,
        passwordHash,
        role,
        storageQuotaGB: storageQuotaGB ?? null,
        assignedSourceIds,
        assignedGroups,
        playlistToken,
        requireToken,
      },
    });

    logger.info({ userId: user.id, username: user.username, role: user.role }, 'User created');
    res.status(201).json({ data: safeUser(user) });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/v1/users/:id ────────────────────────────────────

const updateUserSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  password: z.string().min(8).optional(),
  role: z.enum(['ADMIN', 'USER']).optional(),
  storageQuotaGB: z.number().int().positive().nullable().optional(),
  assignedSourceIds: z.array(z.string()).optional(),
  assignedGroups: z.array(z.string()).optional(),
  requireToken: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

usersRouter.put('/:id', async (req, res, next) => {
  try {
    if (!uuidSchema.safeParse(req.params.id).success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid user ID' } });
      return;
    }

    const body = updateUserSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: body.error.issues[0]?.message ?? 'Invalid input' },
      });
      return;
    }

    const { password, ...rest } = body.data;
    const updateData: Record<string, unknown> = { ...rest };

    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 12);
    }

    const user = await db.user.update({
      where: { id: req.params.id },
      data: updateData,
    });

    logger.info({ userId: user.id }, 'User updated');
    res.json({ data: safeUser(user) });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/v1/users/:id ─────────────────────────────────

usersRouter.delete('/:id', async (req, res, next) => {
  try {
    if (!uuidSchema.safeParse(req.params.id).success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid user ID' } });
      return;
    }

    // Prevent deleting own account
    if (req.user!.sub === req.params.id) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Cannot delete your own account' } });
      return;
    }

    await db.user.delete({ where: { id: req.params.id } });
    logger.info({ userId: req.params.id }, 'User deleted');
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ── POST /api/v1/users/:id/regenerate-token ──────────────────
// Regenerates the playlist token for a user

usersRouter.post('/:id/regenerate-token', async (req, res, next) => {
  try {
    if (!uuidSchema.safeParse(req.params.id).success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid user ID' } });
      return;
    }

    const playlistToken = generatePlaylistToken();
    const user = await db.user.update({
      where: { id: req.params.id },
      data: { playlistToken },
    });

    logger.info({ userId: user.id }, 'Playlist token regenerated');
    res.json({ data: { playlistToken: user.playlistToken } });
  } catch (err) {
    next(err);
  }
});
