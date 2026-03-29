import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

async function main() {
  console.log('Seeding default settings...');

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }

  console.log(`Seeded ${Object.keys(DEFAULT_SETTINGS).length} default settings.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
