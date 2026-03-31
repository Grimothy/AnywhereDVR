// packages/server/src/api/auth.routes.ts
// Authentication routes: login, logout, me, first-run check + setup

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db.js';
import { logger } from '../logger.js';
import { signToken, COOKIE_NAME, COOKIE_OPTIONS } from '../auth/jwt.js';
import { requireAuth } from '../auth/middleware.js';

export const authRouter = Router();

// ── POST /api/v1/auth/login ──────────────────────────────────

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Username and password required' } });
      return;
    }

    const { username, password } = body.data;

    const user = await db.user.findUnique({ where: { username } });
    if (!user || !user.isActive) {
      res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' } });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' } });
      return;
    }

    const token = signToken({ sub: user.id, username: user.username, role: user.role });
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    logger.info({ userId: user.id, username: user.username, role: user.role }, 'User logged in');

    res.json({
      data: {
        id: user.id,
        username: user.username,
        role: user.role,
        storageQuotaGB: user.storageQuotaGB,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/v1/auth/logout ─────────────────────────────────

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ data: { success: true } });
});

// ── GET /api/v1/auth/me ──────────────────────────────────────

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await db.user.findUnique({
      where: { id: req.user!.sub },
      select: {
        id: true,
        username: true,
        role: true,
        storageQuotaGB: true,
        assignedSourceIds: true,
        assignedGroups: true,
        playlistToken: true,
        requireToken: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      return;
    }

    res.json({ data: user });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/v1/auth/setup-status ───────────────────────────
// Returns whether the system needs initial setup (no admin exists yet)

authRouter.get('/setup-status', async (_req, res, next) => {
  try {
    const adminCount = await db.user.count({ where: { role: 'ADMIN' } });
    res.json({ data: { needsSetup: adminCount === 0 } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/v1/auth/setup ──────────────────────────────────
// Creates the first admin account. Only works when no admin exists.

const setupSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Username may only contain letters, numbers, _ and -'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

authRouter.post('/setup', async (req, res, next) => {
  try {
    // Guard: only allowed when no admin exists
    const adminCount = await db.user.count({ where: { role: 'ADMIN' } });
    if (adminCount > 0) {
      res.status(409).json({ error: { code: 'SETUP_COMPLETE', message: 'Setup already complete. Use the login page.' } });
      return;
    }

    const body = setupSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: body.error.issues[0]?.message ?? 'Invalid input' },
      });
      return;
    }

    const { username, password } = body.data;

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await db.user.create({
      data: {
        username,
        passwordHash,
        role: 'ADMIN',
        storageQuotaGB: null, // unlimited
      },
    });

    const token = signToken({ sub: user.id, username: user.username, role: user.role });
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    logger.info({ userId: user.id, username: user.username }, 'Initial admin account created via setup wizard');

    res.status(201).json({
      data: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
});
