// packages/server/src/services/recorder.ts

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, appendFile, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { db } from '../db.js';
import { logger } from '../logger.js';
import { getRecordingSettings } from '../types/recording.js';
import type { ActiveRecording } from '../types/recording.js';
import { postProcessor } from './post-processor.js';
import { notificationManager } from './notification-manager.js';

const GRACEFUL_STOP_TIMEOUT_MS = 10_000;
const STDERR_BUFFER_MAX_BYTES = 4096;

/**
 * Recorder — Manages ffmpeg child processes for active recordings.
 *
 * - Spawns ffmpeg in HLS mode for each recording
 * - Monitors process for exit/errors
 * - Handles graceful shutdown (SIGINT → SIGKILL)
 * - Tracks active recordings in memory
 * - Crash recovery on startup
 */
export class Recorder {
  private activeRecordings = new Map<string, { process: ChildProcess; info: ActiveRecording }>();

  /**
   * Check if we're at the concurrent stream limit
   */
  isAtCapacity(maxConcurrent: number): boolean {
    return this.activeRecordings.size >= maxConcurrent;
  }

  /**
   * Get count of active recordings
   */
  getActiveCount(): number {
    return this.activeRecordings.size;
  }

  /**
   * Get all active recording info
   */
  getActiveRecordings(): ActiveRecording[] {
    return Array.from(this.activeRecordings.values()).map(r => r.info);
  }

  /**
   * Check if a specific recording is active
   */
  isActive(recordingId: string): boolean {
    return this.activeRecordings.has(recordingId);
  }

  /**
   * Crash recovery: On startup, mark any RECORDING status entries as FAILED
   * since the server crashed and ffmpeg processes are gone.
   */
  async recoverFromCrash(): Promise<void> {
    const stale = await db.recording.findMany({
      where: { status: 'RECORDING' },
    });

    if (stale.length === 0) return;

    logger.warn(
      { count: stale.length },
      'Found recordings with RECORDING status on startup — marking as FAILED (crash recovery)',
    );

    for (const recording of stale) {
      await db.recording.update({
        where: { id: recording.id },
        data: {
          status: 'FAILED',
          errorMessage: 'Server restarted during recording',
          ffmpegPid: null,
        },
      });
    }
  }

  /**
   * Start recording: spawn ffmpeg, update DB, monitor process.
   */
  async start(recordingId: string): Promise<void> {
    // Prevent double-start
    if (this.activeRecordings.has(recordingId)) {
      logger.warn({ recordingId }, 'Recording already active — skipping start');
      return;
    }

    const recording = await db.recording.findUnique({
      where: { id: recordingId },
      include: { channel: true },
    });

    if (!recording || !recording.channel) {
      throw new Error(`Recording ${recordingId} not found or missing channel`);
    }

    if (recording.status !== 'SCHEDULED') {
      logger.warn(
        { recordingId, status: recording.status },
        'Recording not in SCHEDULED state — skipping start',
      );
      return;
    }

    const settings = await getRecordingSettings(db);

    // 1. Create live output directory
    const livePath = join(settings.recordingsBasePath, 'live', recordingId);
    await mkdir(livePath, { recursive: true });

    const m3u8Path = join(livePath, 'stream.m3u8');
    const segmentPattern = join(livePath, 'segment_%04d.ts');
    const streamUrl = recording.channel.streamUrl;

    // 2. Spawn ffmpeg
    const ffmpegArgs = [
      '-y',
      '-i', streamUrl,
      '-c', 'copy',
      '-copyts',
      '-start_at_zero',
      '-f', 'hls',
      '-hls_time', '6',
      '-hls_list_size', '0',
      '-hls_flags', 'append_list+omit_endlist',
      '-hls_segment_filename', segmentPattern,
      m3u8Path,
    ];

    logger.info(
      { recordingId, title: recording.title, channel: recording.channel.name, streamUrl },
      'Starting ffmpeg recording',
    );

    const ffmpegProcess = spawn(settings.ffmpegPath, ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const pid = ffmpegProcess.pid ?? null;

    // 3. Update DB: status=RECORDING
    await db.recording.update({
      where: { id: recordingId },
      data: {
        status: 'RECORDING',
        actualStart: new Date(),
        ffmpegPid: pid,
        livePath: `live/${recordingId}/stream.m3u8`,
      },
    });

    // 4. Track in memory
    this.activeRecordings.set(recordingId, {
      process: ffmpegProcess,
      info: {
        recordingId,
        channelId: recording.channelId,
        title: recording.title,
        startedAt: new Date(),
        streamUrl,
        livePath,
      },
    });

    // 5. Monitor process
    this.monitorProcess(recordingId, ffmpegProcess, m3u8Path);

    logger.info(
      { recordingId, pid, title: recording.title },
      'Recording started',
    );

    // Notify clients
    void notificationManager.recordingStarted(recording.title, recordingId);
  }

  /**
   * Stop recording: graceful SIGINT → wait → SIGKILL → finalize m3u8
   */
  async stop(recordingId: string): Promise<void> {
    const active = this.activeRecordings.get(recordingId);
    if (!active) {
      logger.warn({ recordingId }, 'Recording not found in active map — cannot stop');
      return;
    }

    const { process: ffmpegProcess, info } = active;

    logger.info({ recordingId, title: info.title }, 'Stopping recording (SIGINT)');

    return new Promise<void>((resolve) => {
      let resolved = false;

      const finish = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };

      // Set a timeout for SIGKILL if SIGINT doesn't work
      const killTimeout = setTimeout(() => {
        logger.warn({ recordingId }, 'ffmpeg did not exit after SIGINT — sending SIGKILL');
        ffmpegProcess.kill('SIGKILL');
        // Give SIGKILL a moment, then finalize anyway
        setTimeout(() => {
          void this.finalizeRecording(recordingId, info.livePath, false);
          finish();
        }, 1000);
      }, GRACEFUL_STOP_TIMEOUT_MS);

      ffmpegProcess.once('exit', () => {
        clearTimeout(killTimeout);
        void this.finalizeRecording(recordingId, info.livePath, true);
        finish();
      });

      // Send SIGINT for graceful stop
      ffmpegProcess.kill('SIGINT');
    });
  }

  /**
   * Cancel recording: same as stop but marks as CANCELLED
   */
  async cancel(recordingId: string): Promise<void> {
    await this.stop(recordingId);

    // Ensure status is CANCELLED (stop sets it to POST_PROCESSING)
    await db.recording.update({
      where: { id: recordingId },
      data: {
        status: 'CANCELLED',
        errorMessage: 'Cancelled by user',
      },
    });
  }

  /**
   * Stop all active recordings (used during server shutdown)
   */
  async stopAll(): Promise<void> {
    const ids = Array.from(this.activeRecordings.keys());
    logger.info({ count: ids.length }, 'Stopping all active recordings');

    await Promise.all(ids.map(id => this.stop(id)));
  }

  /**
   * Monitor ffmpeg process for unexpected exit
   */
  private monitorProcess(
    recordingId: string,
    ffmpegProcess: ChildProcess,
    m3u8Path: string,
  ): void {
    // Collect stderr for error logging
    let stderrBuffer = '';
    ffmpegProcess.stderr?.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
      // Keep only last 4KB
      if (stderrBuffer.length > STDERR_BUFFER_MAX_BYTES) {
        stderrBuffer = stderrBuffer.slice(-STDERR_BUFFER_MAX_BYTES);
      }
    });

    // Log stdout (usually empty for ffmpeg)
    ffmpegProcess.stdout?.on('data', (chunk: Buffer) => {
      logger.debug({ recordingId }, chunk.toString().trim());
    });

    ffmpegProcess.once('exit', (code, signal) => {
      const active = this.activeRecordings.get(recordingId);
      if (!active) return; // Already handled by stop()

      // Unexpected exit (not triggered by our stop())
      this.activeRecordings.delete(recordingId);

      if (signal === 'SIGINT' || code === 0) {
        // Normal exit — shouldn't happen if stop() handled it, but just in case
        logger.info({ recordingId, code, signal }, 'ffmpeg exited normally (unexpected path)');
        void this.finalizeRecording(recordingId, active.info.livePath, true);
      } else {
        // Abnormal exit
        const errMsg = `ffmpeg exited unexpectedly: code=${code}, signal=${signal}`;
        logger.error(
          { recordingId, code, signal, stderr: stderrBuffer.slice(-500) },
          errMsg,
        );

        void db.recording.update({
          where: { id: recordingId },
          data: {
            status: 'FAILED',
            errorMessage: errMsg,
            ffmpegPid: null,
            actualEnd: new Date(),
          },
        });

        void notificationManager.recordingFailed(active.info.title, recordingId, errMsg);
      }
    });

    ffmpegProcess.on('error', (err) => {
      logger.error({ recordingId, err }, 'ffmpeg process error');
      const active = this.activeRecordings.get(recordingId);
      const title = active?.info.title ?? recordingId;
      this.activeRecordings.delete(recordingId);

      const errMsg = `ffmpeg process error: ${err.message}`;

      void db.recording.update({
        where: { id: recordingId },
        data: {
          status: 'FAILED',
          errorMessage: errMsg,
          ffmpegPid: null,
          actualEnd: new Date(),
        },
      });

      void notificationManager.recordingFailed(title, recordingId, errMsg);
    });
  }

  /**
   * Finalize a recording after ffmpeg stops:
   * - Append #EXT-X-ENDLIST to m3u8
   * - Calculate file size
   * - Update DB status to POST_PROCESSING
   */
  private async finalizeRecording(
    recordingId: string,
    livePath: string,
    graceful: boolean,
  ): Promise<void> {
    this.activeRecordings.delete(recordingId);

    try {
      // Append #EXT-X-ENDLIST to mark stream as complete/VOD
      const m3u8Path = join(livePath, 'stream.m3u8');
      try {
        await appendFile(m3u8Path, '\n#EXT-X-ENDLIST\n');
      } catch {
        logger.warn({ recordingId, m3u8Path }, 'Failed to append EXT-X-ENDLIST to m3u8');
      }

      // Calculate total file size from segments
      let totalSize = BigInt(0);
      try {
        const files = await readdir(livePath);
        for (const file of files) {
          if (file.endsWith('.ts')) {
            const fileStat = await stat(join(livePath, file));
            totalSize += BigInt(fileStat.size);
          }
        }
      } catch {
        logger.warn({ recordingId }, 'Failed to calculate segment file sizes');
      }

      // Update DB
      const updated = await db.recording.update({
        where: { id: recordingId },
        data: {
          status: graceful ? 'POST_PROCESSING' : 'FAILED',
          errorMessage: graceful ? null : 'ffmpeg killed (SIGKILL) — last segment may be corrupted',
          actualEnd: new Date(),
          ffmpegPid: null,
          fileSize: totalSize > 0 ? totalSize : null,
        },
        select: { title: true },
      });

      logger.info(
        { recordingId, graceful, fileSize: totalSize.toString() },
        'Recording finalized',
      );

      // Trigger post-processor pipeline only on graceful stop (Phase 4)
      if (graceful) {
        void notificationManager.recordingCompleted(updated.title, recordingId);
        void postProcessor.run(recordingId);
      }
    } catch (err) {
      logger.error({ recordingId, err }, 'Failed to finalize recording');

      await db.recording.update({
        where: { id: recordingId },
        data: {
          status: 'FAILED',
          errorMessage: `Finalization error: ${err instanceof Error ? err.message : 'unknown'}`,
          ffmpegPid: null,
          actualEnd: new Date(),
        },
      });
    }
  }
}

// Singleton instance
export const recorder = new Recorder();
