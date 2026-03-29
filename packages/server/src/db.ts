import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

export const db = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' },
  ],
});

db.$on('error', (e) => {
  logger.error({ err: e }, 'Prisma error');
});

db.$on('warn', (e) => {
  logger.warn({ warning: e }, 'Prisma warning');
});

/**
 * Verify database connection and seed default settings if missing.
 */
export async function initializeDatabase(): Promise<void> {
  await db.$connect();
  logger.info('Database connected');

  // Seed default settings if first run
  const DEFAULT_SETTINGS: Record<string, string> = {
    maxConcurrentStreams: '2',
    globalDiskQuotaGB: '100',
    recordingsBasePath: '/recordings',
    tmdbApiKey: '',
    epgRefreshIntervalHours: '12',
    sourceRefreshIntervalHours: '24',
    startEarlySeconds: '30',
    endLateSeconds: '60',
    enableComskip: 'true',
    enableTmdbEnrichment: 'true',
    ffmpegPath: '/usr/bin/ffmpeg',
    comskipPath: '/usr/bin/comskip',
  };

  const existingCount = await db.setting.count();
  if (existingCount === 0) {
    logger.info('First run detected — seeding default settings');
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await db.setting.upsert({
        where: { key },
        update: {},
        create: { key, value },
      });
    }
    logger.info(`Seeded ${Object.keys(DEFAULT_SETTINGS).length} default settings`);
  }
}
