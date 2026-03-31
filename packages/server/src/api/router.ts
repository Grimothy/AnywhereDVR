import { Router } from 'express';
import { sourcesRouter } from './sources.routes.js';
import { channelsRouter } from './channels.routes.js';
import { epgRouter } from './epg.routes.js';
import { rulesRouter } from './rules.routes.js';
import { recordingsRouter } from './recordings.routes.js';
import { notificationsRouter } from './notifications.routes.js';
import { settingsRouter } from './settings.routes.js';
import { authRouter } from './auth.routes.js';
import { usersRouter } from './users.routes.js';
import { insightsRouter } from './insights.routes.js';
import { requireAuth } from '../auth/middleware.js';

export const apiRouter = Router();

// Public routes (no auth required)
apiRouter.use('/auth', authRouter);

// Protected routes — all require authentication
apiRouter.use('/sources', requireAuth, sourcesRouter);
apiRouter.use('/channels', requireAuth, channelsRouter);
apiRouter.use('/epg', requireAuth, epgRouter);
apiRouter.use('/rules', requireAuth, rulesRouter);
apiRouter.use('/recordings', requireAuth, recordingsRouter);
apiRouter.use('/notifications', requireAuth, notificationsRouter);
apiRouter.use('/settings', requireAuth, settingsRouter);
apiRouter.use('/insights', requireAuth, insightsRouter);
apiRouter.use('/users', usersRouter); // requireAuth + requireAdmin applied inside

// Health check at /api/v1/health (public)
apiRouter.get('/health', (_req, res) => {
  res.json({ data: { status: 'ok', timestamp: new Date().toISOString() } });
});
