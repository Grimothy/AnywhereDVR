// packages/server/src/services/retention-manager.ts

import { unlink, rmdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { join } from 'node:path';
import { db } from '../db.js';
import { logger } from '../logger.js';
import { notificationManager } from './notification-manager.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Attempt to delete a file from disk. Silently ignores ENOENT (already gone).
 */
async function tryUnlink(filePath: string | null | undefined, basePath: string): Promise<void> {
  if (!filePath) return;
  // filePath may be relative (stored without basePath prefix) or absolute
  const absolute = filePath.startsWith('/') ? filePath : join(basePath, filePath);
  try {
    await unlink(absolute);
    logger.debug({ path: absolute }, 'Deleted file');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn({ path: absolute, err }, 'Failed to delete file');
    }
  }
}

/**
 * Attempt to remove a directory only if it's empty. Silently ignores errors.
 */
async function tryRmEmptyDir(filePath: string | null | undefined, basePath: string): Promise<void> {
  if (!filePath) return;
  const absolute = filePath.startsWith('/') ? filePath : join(basePath, filePath);
  const dir = dirname(absolute);
  try {
    await rmdir(dir); // only removes if empty
  } catch {
    // non-empty or doesn't exist — ignore
  }
}

// ── RetentionManager ──────────────────────────────────────────────────────────

export class RetentionManager {
  /**
   * Run the full retention policy:
   *  1. Per-series keepLast enforcement
   *  2. Global disk quota enforcement
   *  3. Disk warning notification if over 90%
   *
   * Non-fatal overall — errors are logged but not re-thrown.
   */
  async run(recordingsBasePath: string): Promise<void> {
    logger.info('Retention manager: starting run');

    try {
      await this.enforcePerSeriesLimits(recordingsBasePath);
    } catch (err) {
      logger.error({ err }, 'Retention: per-series enforcement failed');
    }

    try {
      await this.enforceGlobalQuota(recordingsBasePath);
    } catch (err) {
      logger.error({ err }, 'Retention: global quota enforcement failed');
    }

    logger.info('Retention manager: run complete');
  }

  // ── Per-series keepLast ──────────────────────────────────────────────────

  private async enforcePerSeriesLimits(basePath: string): Promise<void> {
    // Find all rules with keepLast set
    const rules = await db.recordingRule.findMany({
      where: {
        keepLast: { not: null },
        enabled: true,
      },
      select: { id: true, keepLast: true, seriesTitle: true },
    });

    for (const rule of rules) {
      if (!rule.keepLast) continue;

      const completed = await db.recording.findMany({
        where: {
          ruleId: rule.id,
          status: 'COMPLETED',
        },
        orderBy: { scheduledStart: 'desc' }, // newest first
        select: {
          id: true,
          title: true,
          filePath: true,
          sidecarPath: true,
          edlPath: true,
          scheduledStart: true,
        },
      });

      if (completed.length <= rule.keepLast) continue;

      const toDelete = completed.slice(rule.keepLast); // oldest excess
      logger.info(
        { ruleId: rule.id, seriesTitle: rule.seriesTitle, keepLast: rule.keepLast, deleting: toDelete.length },
        'Retention: pruning old episodes for series rule',
      );

      for (const rec of toDelete) {
        await this.deleteRecording(rec, basePath);
      }
    }
  }

  // ── Global quota ─────────────────────────────────────────────────────────

  private async enforceGlobalQuota(basePath: string): Promise<void> {
    // Read quota from settings
    const quotaSetting = await db.setting.findUnique({ where: { key: 'globalDiskQuotaGB' } });
    if (!quotaSetting) return;

    let quotaGB: number;
    try {
      quotaGB = JSON.parse(quotaSetting.value) as number;
    } catch {
      return;
    }

    if (!quotaGB || quotaGB <= 0) return;

    // Sum fileSize of all COMPLETED recordings
    const agg = await db.recording.aggregate({
      where: { status: 'COMPLETED', fileSize: { not: null } },
      _sum: { fileSize: true },
    });

    const totalBytes = agg._sum.fileSize ?? BigInt(0);
    const usedGB = Number(totalBytes) / (1024 ** 3);
    const quotaFraction = usedGB / quotaGB;

    logger.info(
      { usedGB: usedGB.toFixed(2), quotaGB, pct: Math.round(quotaFraction * 100) },
      'Retention: disk usage check',
    );

    // Warn at 90%
    if (quotaFraction >= 0.9) {
      await notificationManager.diskWarning(usedGB, quotaGB);
    }

    // Enforce quota: delete oldest until under quota
    if (quotaFraction > 1.0) {
      const oldest = await db.recording.findMany({
        where: { status: 'COMPLETED' },
        orderBy: { scheduledStart: 'asc' }, // oldest first
        select: {
          id: true,
          title: true,
          filePath: true,
          sidecarPath: true,
          edlPath: true,
          fileSize: true,
          scheduledStart: true,
        },
      });

      let remaining = usedGB;
      for (const rec of oldest) {
        if (remaining <= quotaGB) break;

        const recGB = rec.fileSize ? Number(rec.fileSize) / (1024 ** 3) : 0;
        logger.info(
          { recordingId: rec.id, title: rec.title, recGB: recGB.toFixed(2) },
          'Retention: deleting recording to meet quota',
        );

        await this.deleteRecording(rec, basePath);
        remaining -= recGB;
      }
    }
  }

  // ── Delete helper ─────────────────────────────────────────────────────────

  private async deleteRecording(
    rec: {
      id: string;
      title: string;
      filePath: string | null;
      sidecarPath: string | null;
      edlPath: string | null;
    },
    basePath: string,
  ): Promise<void> {
    // Delete files from disk
    await tryUnlink(rec.filePath, basePath);
    await tryUnlink(rec.sidecarPath, basePath);
    await tryUnlink(rec.edlPath, basePath);

    // Try to remove empty parent directory
    await tryRmEmptyDir(rec.filePath, basePath);

    // Delete DB row
    try {
      await db.recording.delete({ where: { id: rec.id } });
      logger.info({ recordingId: rec.id, title: rec.title }, 'Retention: recording deleted');
    } catch (err) {
      logger.warn({ recordingId: rec.id, err }, 'Retention: failed to delete DB row');
    }
  }
}

// Singleton instance
export const retentionManager = new RetentionManager();
