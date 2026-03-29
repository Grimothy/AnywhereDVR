import { Router } from 'express';
import { sourcesRouter } from './sources.routes.js';
import { channelsRouter } from './channels.routes.js';
import { epgRouter } from './epg.routes.js';
import { rulesRouter } from './rules.routes.js';
import { recordingsRouter } from './recordings.routes.js';

export const apiRouter = Router();

apiRouter.use('/sources', sourcesRouter);
apiRouter.use('/channels', channelsRouter);
apiRouter.use('/epg', epgRouter);
apiRouter.use('/rules', rulesRouter);
apiRouter.use('/recordings', recordingsRouter);

// Health check at /api/v1/health
apiRouter.get('/health', (_req, res) => {
  res.json({ data: { status: 'ok', timestamp: new Date().toISOString() } });
});
