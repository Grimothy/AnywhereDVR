import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { createServer } from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server as SocketIOServer } from 'socket.io';

// ESM-compatible __dirname that always resolves to the workspace root.
// Works in both dev (tsx → packages/server/src/) and prod (node → packages/server/dist/).
const wsRoot = path.resolve(fileURLToPath(import.meta.url), '../../../../');
const distDir = path.dirname(fileURLToPath(import.meta.url));
const webDistDir = existsSync(path.join(wsRoot, 'packages/web/dist'))
  ? path.join(wsRoot, 'packages/web/dist')
  : path.join(distDir, 'public');

import { config } from './config.js';
import { logger } from './logger.js';
import { db, initializeDatabase } from './db.js';
import { apiRouter } from './api/router.js';
import { m3uOutputRouter } from './api/m3u-output.routes.js';
import { recorder } from './services/recorder.js';
import { scheduler } from './services/scheduler.js';
import { postProcessor } from './services/post-processor.js';
import { notificationManager } from './services/notification-manager.js';

async function main(): Promise<void> {
  // 1. Load and validate config (already done on import)
  logger.info({ port: config.port, env: config.nodeEnv }, 'Configuration loaded');

  // 2. Initialize database + seed defaults
  await initializeDatabase();

  // 3. Crash recovery — mark stale RECORDING entries as FAILED
  await recorder.recoverFromCrash();

  // 4. Crash recovery — mark stale POST_PROCESSING entries as FAILED
  //    (pipeline was interrupted mid-run; re-running is unsafe without the live segments)
  const stalePP = await db.recording.findMany({
    where: { status: 'POST_PROCESSING' },
  });
  if (stalePP.length > 0) {
    logger.warn(
      { count: stalePP.length },
      'Found recordings in POST_PROCESSING on startup — marking as FAILED (crash recovery)',
    );
    for (const rec of stalePP) {
      try {
        await db.recording.update({
          where: { id: rec.id },
          data: {
            status: 'FAILED',
            errorMessage: 'Server restarted during post-processing',
          },
        });
      } catch (err) {
        logger.error({ recordingId: rec.id, err }, 'Failed to mark stale POST_PROCESSING recording as FAILED');
      }
    }
  }

  // Expose postProcessor for future use (e.g. reprocess endpoint in Phase 5)
  void postProcessor;

  // 5. Create Express app
  const app = express();

  // Middleware
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json());

  // Request logging
  app.use((req, _res, next) => {
    logger.debug({ method: req.method, url: req.url }, 'request');
    next();
  });

  // 6. Mount API routes
  app.use('/api/v1', apiRouter);

  // 7. Mount M3U output & HLS serving routes at root level
  app.use('/', m3uOutputRouter);

  // 8. Serve React static files (built web app)
  app.use(express.static(webDistDir));

  // 8b. SPA fallback — serve index.html for non-API/non-media routes
  // Exclude /api, /vod.m3u, /live.m3u, and /recordings/:uuid/... (HLS/file serving).
  // Do NOT exclude bare /recordings — that is a React SPA route.
  const mediaRouteRe = /^\/recordings\/[0-9a-f-]{36}\//i;
  app.use((req, res, next) => {
    if (
      req.url.startsWith('/api') ||
      req.url.startsWith('/vod') ||
      req.url.startsWith('/live') ||
      mediaRouteRe.test(req.url)
    ) {
      next();
    } else {
      res.sendFile(path.join(webDistDir, 'index.html'));
    }
  });

  // 9. Global error handler
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      logger.error({ err }, 'Unhandled error');
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      });
    },
  );

  // 10. Create HTTP server
  const server = createServer(app);

  // 11. Attach Socket.IO
  const io = new SocketIOServer(server, {
    cors: { origin: '*' },
    path: '/socket.io',
  });

  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, 'Socket.IO client connected');
    socket.on('disconnect', () => {
      logger.debug({ socketId: socket.id }, 'Socket.IO client disconnected');
    });
  });

  // Inject Socket.IO broadcaster into notificationManager
  notificationManager.setEmitter((event, data) => {
    io.emit(event, data);
  });

  logger.info('Socket.IO initialized');

  // 12. Start listening
  server.listen(config.port, () => {
    logger.info({ port: config.port }, 'AnywhereDVR server listening');
  });

  // 13. Wire up recorder ↔ scheduler and start scheduling
  scheduler.setRecorder(recorder);
  scheduler.start();
  logger.info('Scheduler started');

  // 14. Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');

    // Stop scheduler first (no new recordings)
    scheduler.stop();

    // Stop all active recordings gracefully
    await recorder.stopAll();

    // Close Socket.IO connections
    await new Promise<void>((resolve) => io.close(() => resolve()));
    logger.info('Socket.IO closed');

    // Wait for HTTP server to drain
    await new Promise<void>((resolve) => server.close(() => {
      logger.info('HTTP server closed');
      resolve();
    }));

    // Disconnect Prisma
    await db.$disconnect();
    logger.info('Database disconnected');

    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
