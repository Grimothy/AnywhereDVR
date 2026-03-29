// packages/server/src/services/post-processor.ts

import { spawn } from 'node:child_process';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { db } from '../db.js';
import { logger } from '../logger.js';
import { getRecordingSettings } from '../types/recording.js';
import { buildRecordingPath } from './file-namer.js';
import { invalidateM3uCache } from '../api/m3u-output.routes.js';

/**
 * PostProcessor — Runs after ffmpeg stops.
 *
 * Pipeline (per spec section 9.6):
 *   Step 1 (FATAL)     — Concatenate HLS segments → single .ts file, measure duration
 *   Step 2 (non-fatal) — Smart rename into library/ directory
 *   Step 3 (non-fatal) — Comskip (Phase 6 — skipped, marked as 'skipped')
 *   Step 4 (non-fatal) — TMDB enrichment (Phase 6 — skipped if no API key)
 *   Step 5 (non-fatal) — Write sidecar .json
 *   Step 6             — Cleanup live/ temp dir, update DB to COMPLETED
 */
export class PostProcessor {
  /**
   * Run the full post-processing pipeline for a recording.
   * Called by the Recorder after ffmpeg exits.
   */
  async run(recordingId: string): Promise<void> {
    logger.info({ recordingId }, 'Post-processing started');

    const recording = await db.recording.findUnique({
      where: { id: recordingId },
      include: {
        channel: { select: { name: true, tvgId: true } },
      },
    });

    if (!recording) {
      logger.error({ recordingId }, 'Post-processor: recording not found');
      return;
    }

    if (recording.status !== 'POST_PROCESSING') {
      logger.warn(
        { recordingId, status: recording.status },
        'Post-processor: recording not in POST_PROCESSING state — skipping',
      );
      return;
    }

    const settings = await getRecordingSettings(db);
    const livePath = join(settings.recordingsBasePath, 'live', recordingId);
    const m3u8Path = join(livePath, 'stream.m3u8');

    // ── Step 1: Concatenate HLS → single .ts ────────────────────────────────

    let outputPath: string;
    let duration: number | null = null;
    let fileSize: bigint | null = null;

    try {
      // Build final destination using file-namer
      const naming = buildRecordingPath({
        title: recording.title,
        subtitle: recording.subtitle,
        season: recording.season,
        episode: recording.episode,
        scheduledStart: recording.scheduledStart,
      });

      outputPath = join(settings.recordingsBasePath, naming.relativePath);
      const outputDir = join(settings.recordingsBasePath, naming.relativeDir);

      await mkdir(outputDir, { recursive: true });

      await ffmpegConcat(settings.ffmpegPath, m3u8Path, outputPath);

      // Measure output file
      const fileStat = await stat(outputPath);
      fileSize = BigInt(fileStat.size);

      // Estimate duration from actual/scheduled times
      if (recording.actualStart && recording.actualEnd) {
        duration = Math.round(
          (recording.actualEnd.getTime() - recording.actualStart.getTime()) / 1000,
        );
      } else {
        duration = Math.round(
          (recording.scheduledEnd.getTime() - recording.scheduledStart.getTime()) / 1000,
        );
      }

      logger.info(
        { recordingId, outputPath, fileSize: fileSize.toString(), duration },
        'Step 1 complete: HLS concatenated',
      );
    } catch (err) {
      logger.error({ recordingId, err }, 'Step 1 FAILED: HLS concatenation failed — marking FAILED');

      await db.recording.update({
        where: { id: recordingId },
        data: {
          status: 'FAILED',
          errorMessage: `Post-processing concat failed: ${err instanceof Error ? err.message : 'unknown'}`,
        },
      });
      return;
    }

    // ── Derive relative filePath for DB storage ──────────────────────────────
    const relativeFilePath = outputPath.startsWith(settings.recordingsBasePath)
      ? outputPath.slice(settings.recordingsBasePath.length).replace(/^\//, '')
      : outputPath;

    // ── Step 2: Update DB with file location (non-fatal) ────────────────────
    try {
      await db.recording.update({
        where: { id: recordingId },
        data: {
          filePath: relativeFilePath,
          fileSize,
          duration,
        },
      });
      logger.info({ recordingId, relativeFilePath }, 'Step 2 complete: file path updated');
    } catch (err) {
      logger.warn({ recordingId, err }, 'Step 2 failed: could not update filePath in DB');
    }

    // ── Step 3: Comskip (Phase 6 — mark skipped) ────────────────────────────
    try {
      await db.recording.update({
        where: { id: recordingId },
        data: { comskipStatus: 'skipped' },
      });
    } catch (err) {
      logger.debug({ recordingId, err }, 'Step 3: comskip status update skipped');
    }

    // ── Step 4: TMDB enrichment (Phase 6 — skip if no API key) ──────────────
    // TMDB enrichment deferred to Phase 6 (requires external API key).
    // Graceful skip — recording still completes without it.

    // ── Step 5: Write sidecar .json (non-fatal) ──────────────────────────────
    let sidecarPath: string | null = null;
    try {
      sidecarPath = outputPath.replace(/\.ts$/, '.json');
      const sidecar = buildSidecar(recording, duration);
      await writeFile(sidecarPath, JSON.stringify(sidecar, null, 2), 'utf-8');
      logger.info({ recordingId, sidecarPath }, 'Step 5 complete: sidecar JSON written');
    } catch (err) {
      logger.warn({ recordingId, err }, 'Step 5 failed: could not write sidecar JSON');
      sidecarPath = null;
    }

    // ── Step 6: Cleanup + finalize ───────────────────────────────────────────
    // Delete live/ temp directory
    try {
      await rm(livePath, { recursive: true, force: true });
      logger.info({ recordingId, livePath }, 'Step 6: temp directory cleaned up');
    } catch (err) {
      logger.warn({ recordingId, err }, 'Step 6: failed to clean up temp directory');
    }

    // Mark COMPLETED
    try {
      const relativeSidecarPath = sidecarPath && sidecarPath.startsWith(settings.recordingsBasePath)
        ? sidecarPath.slice(settings.recordingsBasePath.length).replace(/^\//, '')
        : sidecarPath;

      await db.recording.update({
        where: { id: recordingId },
        data: {
          status: 'COMPLETED',
          filePath: relativeFilePath,
          sidecarPath: relativeSidecarPath,
          fileSize,
          duration,
          livePath: null,
          errorMessage: null,
        },
      });

      // Invalidate M3U cache so /vod.m3u reflects the new recording
      invalidateM3uCache();

      logger.info({ recordingId, relativeFilePath }, 'Post-processing complete — recording COMPLETED');
    } catch (err) {
      logger.error({ recordingId, err }, 'Step 6 FAILED: could not mark recording as COMPLETED');
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Run ffmpeg to concatenate an HLS playlist into a single .ts file.
 * Resolves when ffmpeg exits 0, rejects on non-zero exit or error.
 */
function ffmpegConcat(
  ffmpegPath: string,
  inputM3u8: string,
  outputFile: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ['-y', '-i', inputM3u8, '-c', 'copy', outputFile];

    logger.debug({ ffmpegPath, args }, 'Running ffmpeg concat');

    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 8192) stderr = stderr.slice(-8192);
    });

    proc.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg concat exited with code ${code}: ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`ffmpeg concat spawn error: ${err.message}`));
    });
  });
}

/**
 * Build the sidecar JSON metadata object.
 */
function buildSidecar(
  recording: {
    title: string;
    subtitle: string | null;
    description: string | null;
    season: number | null;
    episode: number | null;
    scheduledStart: Date;
    actualStart: Date | null;
    category: string | null;
    posterUrl: string | null;
    backdropUrl: string | null;
    tmdbId: number | null;
    channel: { name: string; tvgId: string | null } | null;
  },
  duration: number | null,
): Record<string, unknown> {
  return {
    title: recording.title,
    subtitle: recording.subtitle ?? null,
    description: recording.description ?? null,
    season: recording.season ?? null,
    episode: recording.episode ?? null,
    airDate: recording.scheduledStart.toISOString().slice(0, 10),
    recordedAt: (recording.actualStart ?? recording.scheduledStart).toISOString(),
    duration: duration ?? null,
    channel: recording.channel?.name ?? null,
    category: recording.category ?? null,
    posterUrl: recording.posterUrl ?? null,
    backdropUrl: recording.backdropUrl ?? null,
    tmdbId: recording.tmdbId ?? null,
    commercials: [], // Populated by comskip in Phase 6
  };
}

// Singleton instance
export const postProcessor = new PostProcessor();
