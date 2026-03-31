// packages/server/src/services/scheduler.ts

import { db } from '../db.js';
import { logger } from '../logger.js';
import { getRecordingSettings } from '../types/recording.js';
import { retentionManager } from './retention-manager.js';
import { notificationManager } from './notification-manager.js';
import type { Recorder } from './recorder.js';
import { syncSource } from './source-manager.js';

const TICK_INTERVAL_MS = 60_000;           // 60 seconds
const LOOKAHEAD_MS = 30 * 60_000;        // 30 minutes into the future
const RETENTION_INTERVAL_MS = 60 * 60_000; // 1 hour
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Scheduler — Runs every 60 seconds.
 *
 * 1. MATCH: Query upcoming programs (next 30 min) that match enabled rules
 * 2. DEDUPLICATE: Skip programs already scheduled
 * 3. CONFLICT RESOLUTION: Respect maxConcurrentStreams; prioritize by rule.priority
 * 4. CREATE: Insert Recording rows with status=SCHEDULED
 * 5. TRIGGER: Start recordings whose scheduledStart <= now
 * 6. CLEANUP: Stop recordings whose scheduledEnd <= now
 */
export class Scheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private retentionTimer: ReturnType<typeof setInterval> | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private recorder: Recorder | null = null;
  private isRunning = false;

  /**
   * Set the recorder reference (avoids circular dependency)
   */
  setRecorder(recorder: Recorder): void {
    this.recorder = recorder;
  }

  /**
   * Start the scheduler loop
   */
  start(): void {
    if (this.timer) return;

    logger.info('Scheduler starting');

    // Run immediately, then on interval
    void this.tick();
    this.timer = setInterval(() => void this.tick(), TICK_INTERVAL_MS);

    // Run retention once on startup (after a short delay), then every hour
    setTimeout(() => void this.runRetention(), 10_000);
    this.retentionTimer = setInterval(() => void this.runRetention(), RETENTION_INTERVAL_MS);

    // Run source sync once on startup (after 15s to let server settle), then every 24h
    setTimeout(() => void this.syncAllSources(), 15_000);
    this.syncTimer = setInterval(() => void this.syncAllSources(), SYNC_INTERVAL_MS);
  }

  /**
   * Stop the scheduler loop
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.retentionTimer) {
      clearInterval(this.retentionTimer);
      this.retentionTimer = null;
    }
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    logger.info('Scheduler stopped');
  }

  /**
   * Single scheduler tick — called every 60 seconds
   */
  async tick(): Promise<void> {
    if (this.isRunning) {
      logger.debug('Scheduler tick skipped — previous tick still running');
      return;
    }

    this.isRunning = true;

    try {
      const settings = await getRecordingSettings(db);

      // Step 1-4: Match rules to programs, create SCHEDULED recordings
      await this.matchAndSchedule(settings.startEarlySeconds, settings.endLateSeconds);

      // Step 5: Trigger recordings whose start time has arrived
      await this.triggerPendingRecordings(settings.maxConcurrentStreams);

      // Step 6: Stop recordings whose end time has passed
      await this.stopExpiredRecordings();
    } catch (err) {
      logger.error({ err }, 'Scheduler tick failed');
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * STEP 1-4: Match enabled rules against upcoming EPG programs
   * and create SCHEDULED recording entries.
   */
  private async matchAndSchedule(
    globalStartEarly: number,
    globalEndLate: number,
  ): Promise<void> {
    const now = new Date();
    const lookahead = new Date(now.getTime() + LOOKAHEAD_MS);

    // Get all enabled rules
    const rules = await db.recordingRule.findMany({
      where: { enabled: true },
      include: { channel: true },
    });

    if (rules.length === 0) return;

    for (const rule of rules) {
      try {
        await this.matchRule(rule, now, lookahead, globalStartEarly, globalEndLate);
      } catch (err) {
        logger.error({ ruleId: rule.id, err }, 'Failed to match rule');
      }
    }
  }

  /**
   * Match a single rule against upcoming programs and create recordings
   */
  private async matchRule(
    rule: Awaited<ReturnType<typeof db.recordingRule.findMany>>[number] & { channel: Awaited<ReturnType<typeof db.channel.findUnique>> | null },
    now: Date,
    lookahead: Date,
    globalStartEarly: number,
    globalEndLate: number,
  ): Promise<void> {
    if (rule.type === 'SERIES') {
      await this.matchSeriesRule(rule, now, lookahead, globalStartEarly, globalEndLate);
    } else if (rule.type === 'ONCE') {
      await this.matchOnceRule(rule, now, lookahead, globalStartEarly, globalEndLate);
    } else if (rule.type === 'MANUAL') {
      await this.matchManualRule(rule, now, globalStartEarly);
    }
  }

  /**
   * SERIES rule: Find programs matching title (case-insensitive contains)
   */
  private async matchSeriesRule(
    rule: Awaited<ReturnType<typeof db.recordingRule.findMany>>[number],
    now: Date,
    lookahead: Date,
    globalStartEarly: number,
    globalEndLate: number,
  ): Promise<void> {
    if (!rule.seriesTitle) return;

    const where: Record<string, unknown> = {
      title: { contains: rule.seriesTitle, mode: 'insensitive' },
      startTime: { gte: now, lte: lookahead },
    };

    if (rule.channelId) {
      where.channelId = rule.channelId;
    }

    if (rule.newOnly === 'NEW_ONLY') {
      where.isNew = true;
    }

    const programs = await db.program.findMany({
      where,
      include: { channel: true },
    });

    if (programs.length === 0) return;

    // Batch check: find which programs already have recordings (avoid N+1)
    // Include CANCELLED and FAILED so a user-deleted or failed recording for this
    // specific airing doesn't get re-scheduled on the next tick.
    const programIds = programs.map(p => p.id);
    const existingRecordings = await db.recording.findMany({
      where: {
        programId: { in: programIds },
        status: { in: ['SCHEDULED', 'RECORDING', 'POST_PROCESSING', 'COMPLETED', 'CANCELLED', 'FAILED'] },
      },
      select: { programId: true },
    });
    const existingProgramIds = new Set(existingRecordings.map(r => r.programId));

    for (const program of programs) {
      if (existingProgramIds.has(program.id)) continue;
      await this.createRecording(rule, program, globalStartEarly, globalEndLate);
    }
  }

  /**
   * ONCE rule: Find the specific program by ID
   */
  private async matchOnceRule(
    rule: Awaited<ReturnType<typeof db.recordingRule.findMany>>[number],
    now: Date,
    lookahead: Date,
    globalStartEarly: number,
    globalEndLate: number,
  ): Promise<void> {
    if (!rule.programId) return;

    let program = await db.program.findUnique({
      where: { id: rule.programId },
      include: { channel: true },
    });

    if (!program) {
      // programId is stale (EPG re-synced and the program row was recreated).
      // This should not happen anymore now that channels are upserted rather than
      // deleted+recreated, but handle it gracefully just in case.
      logger.warn(
        { ruleId: rule.id, programId: rule.programId },
        'ONCE rule programId not found — program may have been replaced by EPG refresh. Rule needs to be recreated.',
      );
      // Disable the dead rule so it stops spamming on every tick
      await db.recordingRule.update({
        where: { id: rule.id },
        data: { enabled: false },
      });
      return;
    }

    // Match if:
    //   - Program starts within the lookahead window (upcoming), OR
    //   - Program is currently airing (started in the past but hasn't ended yet)
    const isUpcoming = program.startTime >= now && program.startTime <= lookahead;
    const isCurrentlyAiring = program.startTime < now && program.endTime > now;
    if (!isUpcoming && !isCurrentlyAiring) return;

    // Check if already scheduled/recorded/cancelled for this program airing.
    // Include CANCELLED so a user-deleted recording doesn't get re-created on the next tick.
    const existing = await db.recording.findFirst({
      where: {
        programId: program.id,
        status: { in: ['SCHEDULED', 'RECORDING', 'POST_PROCESSING', 'COMPLETED', 'CANCELLED'] },
      },
    });
    if (existing) return;

    await this.createRecording(rule, program, globalStartEarly, globalEndLate);
  }

  /**
   * MANUAL rule: Check if current time is within the manual window
   */
  private async matchManualRule(
    rule: Awaited<ReturnType<typeof db.recordingRule.findMany>>[number],
    now: Date,
    _globalStartEarly: number,
  ): Promise<void> {
    if (!rule.manualStart || !rule.manualEnd || !rule.channelId) return;

    // Only match if manual window hasn't ended yet
    if (rule.manualEnd <= now) return;

    // Check if a recording already exists for this rule (including cancelled — don't re-create)
    const existing = await db.recording.findFirst({
      where: {
        ruleId: rule.id,
        status: { in: ['SCHEDULED', 'RECORDING', 'POST_PROCESSING', 'COMPLETED', 'CANCELLED'] },
      },
    });

    if (existing) return;

    // Get channel
    const channel = await db.channel.findUnique({ where: { id: rule.channelId } });
    if (!channel) return;

    await db.recording.create({
      data: {
        ruleId: rule.id,
        channelId: channel.id,
        title: channel.name,
        subtitle: 'Manual Recording',
        scheduledStart: rule.manualStart,
        scheduledEnd: rule.manualEnd,
        status: 'SCHEDULED',
      },
    });

    logger.info(
      { ruleId: rule.id, channelName: channel.name },
      'Scheduled manual recording',
    );
  }

  /**
   * Create a SCHEDULED recording entry for a matched program.
   * Deduplication is handled by the caller.
   */
  private async createRecording(
    rule: Awaited<ReturnType<typeof db.recordingRule.findMany>>[number],
    program: Awaited<ReturnType<typeof db.program.findUnique>> & { channel: Awaited<ReturnType<typeof db.channel.findUnique>> },
    globalStartEarly: number,
    globalEndLate: number,
  ): Promise<void> {
    if (!program || !program.channel) return;

    // Apply time adjustments (rule overrides take precedence over global)
    const startEarly = rule.startEarly > 0 ? rule.startEarly : globalStartEarly;
    const endLate = rule.endLate > 0 ? rule.endLate : globalEndLate;

    const scheduledStart = new Date(program.startTime.getTime() - startEarly * 1000);
    const scheduledEnd = new Date(program.endTime.getTime() + endLate * 1000);

    await db.recording.create({
      data: {
        ruleId: rule.id,
        channelId: program.channel.id,
        programId: program.id,
        title: program.title,
        subtitle: program.subtitle,
        description: program.description,
        season: program.season,
        episode: program.episode,
        category: program.category,
        scheduledStart,
        scheduledEnd,
        status: 'SCHEDULED',
      },
    });

    logger.info(
      {
        ruleId: rule.id,
        programId: program.id,
        title: program.title,
        channel: program.channel.name,
        start: scheduledStart.toISOString(),
      },
      'Scheduled recording',
    );
  }

  /**
   * STEP 5: TRIGGER — Start recordings whose scheduledStart <= now
   */
  private async triggerPendingRecordings(maxConcurrent: number): Promise<void> {
    if (!this.recorder) {
      logger.warn('Recorder not set — cannot trigger recordings');
      return;
    }

    const now = new Date();

    // Find SCHEDULED recordings ready to start
    const pending = await db.recording.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledStart: { lte: now },
      },
      include: {
        rule: { select: { priority: true } },
      },
      orderBy: { scheduledStart: 'asc' },
    });

    if (pending.length === 0) return;

    // Sort by priority (highest first) for conflict resolution
    pending.sort((a, b) => (b.rule?.priority ?? 50) - (a.rule?.priority ?? 50));

    for (const recording of pending) {
      // Check capacity before each start
      if (this.recorder.isAtCapacity(maxConcurrent)) {
        logger.warn(
          { recordingId: recording.id, title: recording.title },
          'At max concurrent streams — deferring recording',
        );

        // Mark as FAILED if it's a ONCE rule and was supposed to start
        // (SERIES rules can be retried on next airing)
        if (recording.rule === null) {
          await db.recording.update({
            where: { id: recording.id },
            data: {
              status: 'FAILED',
              errorMessage: `Exceeded max concurrent streams (${maxConcurrent})`,
            },
          });
        }
        continue;
      }

      try {
        await this.recorder.start(recording.id);
      } catch (err) {
        logger.error({ recordingId: recording.id, err }, 'Failed to start recording');
      }
    }
  }

  /**
   * STEP 6: CLEANUP — Stop recordings whose scheduledEnd <= now
   */
  private async stopExpiredRecordings(): Promise<void> {
    if (!this.recorder) return;

    const now = new Date();

    const expired = await db.recording.findMany({
      where: {
        status: 'RECORDING',
        scheduledEnd: { lte: now },
      },
    });

    for (const recording of expired) {
      try {
        await this.recorder.stop(recording.id);
        logger.info({ recordingId: recording.id, title: recording.title }, 'Stopped expired recording');
      } catch (err) {
        logger.error({ recordingId: recording.id, err }, 'Failed to stop expired recording');
      }
    }

    // Also check for cancelled recordings that need to be stopped
    const cancelled = await db.recording.findMany({
      where: {
        status: 'CANCELLED',
        ffmpegPid: { not: null },
      },
    });

    for (const recording of cancelled) {
      try {
        await this.recorder.stop(recording.id);
        logger.info({ recordingId: recording.id }, 'Stopped cancelled recording');
      } catch (err) {
        logger.error({ recordingId: recording.id, err }, 'Failed to stop cancelled recording');
      }
    }
  }

  /**
   * Run the retention manager. Called on startup (delayed) and every hour.
   */
  private async runRetention(): Promise<void> {
    try {
      const settings = await getRecordingSettings(db);
      await retentionManager.run(settings.recordingsBasePath);
    } catch (err) {
      logger.error({ err }, 'Retention run failed');
    }
  }

  /**
   * Sync all sources that have daily refresh enabled.
   * Called on startup (delayed) and every 24 hours.
   */
  private async syncAllSources(): Promise<void> {
    let sources: Awaited<ReturnType<typeof db.source.findMany>>;
    try {
      sources = await db.source.findMany({
        where: { refreshDaily: true },
      });
    } catch (err) {
      logger.error({ err }, 'Failed to query sources for daily sync');
      return;
    }

    if (sources.length === 0) return;

    logger.info({ count: sources.length }, 'Starting daily source sync');

    for (const source of sources) {
      try {
        const result = await syncSource(source.id);
        logger.info(
          { sourceId: source.id, sourceName: source.name, channelCount: result.channelCount },
          'Daily source sync completed',
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ sourceId: source.id, sourceName: source.name, err }, 'Daily source sync failed');
        void notificationManager.sourceSyncError(source.name, source.id, message);
      }
    }
  }
}

// Singleton instance
export const scheduler = new Scheduler();
