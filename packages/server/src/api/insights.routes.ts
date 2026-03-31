import { Router } from 'express';
import { db } from '../db.js';

export const insightsRouter = Router();

// ── GET /api/v1/insights ─────────────────────────────────────
// Returns a bundle of DVR statistics and smart suggestions in one request.
//
// Suggestions produced:
//   1. "Frequently recorded, no pass" — titles recorded 3+ times with no SERIES rule
//   2. "Pass with no recent activity" — SERIES rules enabled, 0 recordings in past 30 days
//   3. "Pass recording new-only but all are reruns" — newOnly=NEW_ONLY but recent recs are all isNew=false
//   4. "Top categories you record" — top 5 categories by count
//   5. "Most active channels" — top 5 channels by completed recording count
//   6. "Failed recordings" — titles that have failed recently (may need attention)

insightsRouter.get('/', async (_req, res, next) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // ── Fetch all the raw data we need in parallel ──────────
    const [
      allCompleted,
      allRules,
      recentFailed,
      upcomingScheduled,
      statusCounts,
      storageTotals,
    ] = await Promise.all([
      // All completed recordings (title, category, channel, fileSize, duration, createdAt, isNew)
      db.recording.findMany({
        where: { status: 'COMPLETED' },
        select: {
          id: true,
          title: true,
          category: true,
          channelId: true,
          fileSize: true,
          duration: true,
          scheduledStart: true,
          ruleId: true,
          channel: { select: { id: true, name: true, tvgLogo: true } },
        },
        orderBy: { scheduledStart: 'desc' },
      }),

      // All recording rules with their recent recording counts
      db.recordingRule.findMany({
        include: {
          channel: { select: { id: true, name: true, tvgLogo: true } },
          _count: { select: { recordings: true } },
        },
      }),

      // Recordings that failed in the last 7 days
      db.recording.findMany({
        where: {
          status: 'FAILED',
          scheduledStart: { gte: sevenDaysAgo },
        },
        select: {
          id: true,
          title: true,
          scheduledStart: true,
          errorMessage: true,
          channel: { select: { id: true, name: true, tvgLogo: true } },
        },
        orderBy: { scheduledStart: 'desc' },
        take: 20,
      }),

      // Upcoming scheduled in the next 7 days
      db.recording.findMany({
        where: {
          status: { in: ['SCHEDULED', 'RECORDING'] },
          scheduledStart: { lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
        },
        select: {
          id: true,
          title: true,
          scheduledStart: true,
          scheduledEnd: true,
          status: true,
          channel: { select: { id: true, name: true, tvgLogo: true } },
        },
        orderBy: { scheduledStart: 'asc' },
      }),

      // Status breakdown counts
      db.recording.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),

      // Total storage by status
      db.recording.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { fileSize: true },
        _count: { _all: true },
        _avg: { duration: true },
      }),
    ]);

    // ── Stats summary ──────────────────────────────────────
    const statusBreakdown: Record<string, number> = {};
    for (const row of statusCounts) {
      statusBreakdown[row.status] = row._count._all;
    }

    const totalCompletedBytes = storageTotals._sum.fileSize ?? BigInt(0);
    const totalCompletedCount = storageTotals._count._all;
    const avgDurationSeconds = storageTotals._avg.duration ?? 0;

    // ── Top categories ─────────────────────────────────────
    const categoryCount = new Map<string, number>();
    for (const rec of allCompleted) {
      if (rec.category) {
        categoryCount.set(rec.category, (categoryCount.get(rec.category) ?? 0) + 1);
      }
    }
    const topCategories = Array.from(categoryCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, count]) => ({ category, count }));

    // ── Most active channels ───────────────────────────────
    const channelCount = new Map<string, { count: number; name: string; tvgLogo: string | null }>();
    for (const rec of allCompleted) {
      if (!rec.channel) continue;
      const existing = channelCount.get(rec.channelId);
      if (existing) {
        existing.count++;
      } else {
        channelCount.set(rec.channelId, {
          count: 1,
          name: rec.channel.name,
          tvgLogo: rec.channel.tvgLogo ?? null,
        });
      }
    }
    const topChannels = Array.from(channelCount.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([channelId, data]) => ({ channelId, ...data }));

    // ── Suggestions ────────────────────────────────────────

    const suggestions: Array<{
      type: string
      title: string
      body: string
      severity: 'info' | 'warning' | 'tip'
      action?: string
      actionTarget?: string
    }> = [];

    // Set of series titles that already have a SERIES rule
    const seriesRuleTitles = new Set(
      allRules
        .filter((r) => r.type === 'SERIES')
        .map((r) => r.seriesTitle?.toLowerCase() ?? '')
        .filter(Boolean)
    );

    // 1. Frequently recorded without a pass
    const titleRecordCount = new Map<string, number>();
    for (const rec of allCompleted) {
      const key = rec.title.toLowerCase();
      titleRecordCount.set(key, (titleRecordCount.get(key) ?? 0) + 1);
    }
    const noPassCandidates = Array.from(titleRecordCount.entries())
      .filter(([titleKey, count]) => count >= 3 && !seriesRuleTitles.has(titleKey))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    for (const [titleKey, count] of noPassCandidates) {
      // Recover original-case title from recordings
      const originalTitle = allCompleted.find((r) => r.title.toLowerCase() === titleKey)?.title ?? titleKey;
      suggestions.push({
        type: 'NO_PASS',
        title: `Add a Series Pass for "${originalTitle}"`,
        body: `You've recorded it ${count} times manually. A Series Pass will catch every episode automatically.`,
        severity: 'tip',
        action: 'series-pass',
        actionTarget: originalTitle,
      });
    }

    // 2. Enabled SERIES rules with zero activity in the last 30 days
    const recentByRuleId = new Map<string, number>();
    for (const rec of allCompleted) {
      if (rec.ruleId && new Date(rec.scheduledStart) >= thirtyDaysAgo) {
        recentByRuleId.set(rec.ruleId, (recentByRuleId.get(rec.ruleId) ?? 0) + 1);
      }
    }

    const staleRules = allRules.filter(
      (r) =>
        r.type === 'SERIES' &&
        r.enabled &&
        r._count.recordings > 0 && // has recorded at least once (not brand new)
        (recentByRuleId.get(r.id) ?? 0) === 0
    );

    for (const rule of staleRules.slice(0, 3)) {
      suggestions.push({
        type: 'STALE_PASS',
        title: `"${rule.seriesTitle}" hasn't recorded in 30 days`,
        body: `The Series Pass is enabled but nothing has been recorded. The show may be on hiatus or the EPG title may have changed.`,
        severity: 'warning',
        action: 'view-pass',
        actionTarget: rule.id,
      });
    }

    // 3. Failed recordings that need attention
    if (recentFailed.length > 0) {
      const uniqueFailedTitles = [...new Set(recentFailed.map((r) => r.title))].slice(0, 3);
      suggestions.push({
        type: 'RECENT_FAILURES',
        title: `${recentFailed.length} recording${recentFailed.length !== 1 ? 's' : ''} failed in the last 7 days`,
        body: uniqueFailedTitles.join(', ') + (recentFailed.length > 3 ? ` and ${recentFailed.length - 3} more` : ''),
        severity: 'warning',
        action: 'view-failed',
      });
    }

    // 4. Passes with zero total recordings (created but never matched)
    const neverFiredRules = allRules.filter(
      (r) => r.type === 'SERIES' && r.enabled && r._count.recordings === 0
    );
    for (const rule of neverFiredRules.slice(0, 2)) {
      const age = Math.round((now.getTime() - new Date(rule.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      if (age >= 7) { // only flag if rule is at least 7 days old
        suggestions.push({
          type: 'NEVER_FIRED',
          title: `Pass for "${rule.seriesTitle}" has never recorded`,
          body: `Created ${age} days ago but no episodes have been matched. Check that the EPG title is correct.`,
          severity: 'warning',
          action: 'view-pass',
          actionTarget: rule.id,
        });
      }
    }

    // ── Response ───────────────────────────────────────────
    res.json({
      data: {
        stats: {
          totalCompleted: totalCompletedCount,
          totalStorageBytes: totalCompletedBytes.toString(),
          avgDurationSeconds: Math.round(avgDurationSeconds),
          statusBreakdown,
          activePasses: allRules.filter((r) => r.type === 'SERIES' && r.enabled).length,
          totalPasses: allRules.filter((r) => r.type === 'SERIES').length,
          upcomingCount: upcomingScheduled.length,
        },
        topCategories,
        topChannels,
        suggestions,
        recentFailed: recentFailed.map((r) => ({
          ...r,
          scheduledStart: r.scheduledStart.toISOString(),
        })),
        upcoming: upcomingScheduled.map((r) => ({
          ...r,
          scheduledStart: r.scheduledStart.toISOString(),
          scheduledEnd: r.scheduledEnd.toISOString(),
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});
