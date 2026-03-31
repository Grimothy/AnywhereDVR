// packages/server/src/services/notification-manager.ts

import { db } from '../db.js';
import { logger } from '../logger.js';
import type { NotificationType } from '@prisma/client';

// ── Types ─────────────────────────────────────────────────────────────────────

export type { NotificationType };

export interface NotificationData {
  recordingId?: string;
  sourceId?: string;
  [key: string]: unknown;
}

// Socket.IO emitter — injected at startup to avoid circular imports
type SocketEmitter = (event: string, data: unknown) => void;
let _emit: SocketEmitter | null = null;

// ── NotificationManager ───────────────────────────────────────────────────────

export class NotificationManager {
  /**
   * Inject a Socket.IO emitter so notifications are pushed in real-time.
   * Called during server startup after Socket.IO is initialized.
   */
  setEmitter(emit: SocketEmitter): void {
    _emit = emit;
  }

  /**
   * Emit a raw Socket.IO event to all connected clients.
   * Use for real-time UI updates that don't need a DB notification record.
   */
  socketEmit(event: string, data: unknown): void {
    if (_emit) _emit(event, data);
  }

  /**
   * Create and persist a notification. Emits a Socket.IO event if connected.
   */
  async create(
    type: NotificationType,
    title: string,
    message: string,
    data?: NotificationData,
  ): Promise<void> {
    try {
      const notification = await db.notification.create({
        data: {
          type,
          title,
          message,
          data: data ? (data as object) : undefined,
        },
      });

      logger.info({ notificationId: notification.id, type, title }, 'Notification created');

      // Push to connected clients via Socket.IO
      if (_emit) {
        _emit('notification:new', {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          read: notification.read,
          data: notification.data,
          createdAt: notification.createdAt.toISOString(),
        });
      }
    } catch (err) {
      // Notifications are non-critical — log but never throw
      logger.warn({ err, type, title }, 'Failed to create notification');
    }
  }

  /**
   * Mark a single notification as read.
   */
  async markRead(id: string): Promise<void> {
    await db.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  /**
   * Mark all notifications as read.
   */
  async markAllRead(): Promise<void> {
    await db.notification.updateMany({
      where: { read: false },
      data: { read: true },
    });
  }

  /**
   * List notifications, newest first.
   */
  async list(limit = 50): Promise<Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    read: boolean;
    data: unknown;
    createdAt: string;
  }>> {
    const rows = await db.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      read: n.read,
      data: n.data,
      createdAt: n.createdAt.toISOString(),
    }));
  }

  // ── Convenience helpers ────────────────────────────────────────────────────

  recordingStarted(title: string, recordingId: string): Promise<void> {
    return this.create('RECORDING_STARTED', 'Recording Started', `Now recording: ${title}`, { recordingId });
  }

  recordingCompleted(title: string, recordingId: string): Promise<void> {
    return this.create('RECORDING_COMPLETED', 'Recording Completed', `Finished recording: ${title}`, { recordingId });
  }

  recordingFailed(title: string, recordingId: string, error?: string): Promise<void> {
    const msg = error ? `Recording failed: ${title} — ${error}` : `Recording failed: ${title}`;
    return this.create('RECORDING_FAILED', 'Recording Failed', msg, { recordingId });
  }

  diskWarning(usedGB: number, quotaGB: number): Promise<void> {
    const pct = Math.round((usedGB / quotaGB) * 100);
    return this.create('DISK_WARNING', 'Disk Space Warning', `Recordings storage is ${pct}% full (${usedGB.toFixed(1)} GB of ${quotaGB} GB used)`);
  }

  sourceSyncError(sourceName: string, sourceId: string, error: string): Promise<void> {
    return this.create('SOURCE_SYNC_ERROR', 'Source Sync Error', `Failed to sync "${sourceName}": ${error}`, { sourceId });
  }
}

// Singleton instance
export const notificationManager = new NotificationManager();
