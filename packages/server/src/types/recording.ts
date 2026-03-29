// packages/server/src/types/recording.ts

import type { PrismaClient } from '@prisma/client';

/**
 * Recording-related TypeScript types for Phase 3.
 */

/**
 * Setting keys relevant to the recording engine
 */
export interface RecordingSettings {
  maxConcurrentStreams: number;
  recordingsBasePath: string;
  startEarlySeconds: number;
  endLateSeconds: number;
  ffmpegPath: string;
}

/**
 * Helper to fetch recording-related settings from DB.
 */
export async function getRecordingSettings(
  prisma: Pick<PrismaClient, 'setting'>,
): Promise<RecordingSettings> {
  const keys = [
    'maxConcurrentStreams',
    'recordingsBasePath',
    'startEarlySeconds',
    'endLateSeconds',
    'ffmpegPath',
  ];

  const settings = await prisma.setting.findMany({
    where: { key: { in: keys } },
  });

  const map = new Map(settings.map((s) => [s.key, s.value]));

  return {
    maxConcurrentStreams: parseInt(map.get('maxConcurrentStreams') ?? '2', 10),
    recordingsBasePath: map.get('recordingsBasePath') ?? '/recordings',
    startEarlySeconds: parseInt(map.get('startEarlySeconds') ?? '30', 10),
    endLateSeconds: parseInt(map.get('endLateSeconds') ?? '60', 10),
    ffmpegPath: map.get('ffmpegPath') ?? '/usr/bin/ffmpeg',
  };
}

/**
 * Active recording info tracked in memory by the Recorder
 */
export interface ActiveRecording {
  recordingId: string;
  channelId: string;
  title: string;
  startedAt: Date;
  streamUrl: string;
  livePath: string;
}
