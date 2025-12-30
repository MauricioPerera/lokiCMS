/**
 * Scheduler Service
 * Background worker for scheduled entry publishing
 */

import { getEntriesCollection } from '../db/index.js';
import { hookSystem } from '../plugins/index.js';
import type { Entry } from '../models/index.js';
import type { Doc } from '../lib/lokijs/index.js';

export interface SchedulerStats {
  isRunning: boolean;
  lastRun: number | null;
  nextRun: number | null;
  publishedCount: number;
  intervalMs: number;
}

export class SchedulerService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private lastRun: number | null = null;
  private publishedCount = 0;
  private intervalMs: number;

  constructor(intervalMs = 60000) {  // Default: check every minute
    this.intervalMs = intervalMs;
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) {
      console.log('[Scheduler] Already running');
      return;
    }

    console.log(`[Scheduler] Starting with ${this.intervalMs}ms interval`);
    this.isRunning = true;

    // Run immediately on start
    this.checkScheduledEntries();

    // Then run at interval
    this.intervalId = setInterval(() => {
      this.checkScheduledEntries();
    }, this.intervalMs);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log('[Scheduler] Stopping');
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Check and publish scheduled entries
   */
  async checkScheduledEntries(): Promise<number> {
    const now = Date.now();
    this.lastRun = now;

    try {
      const collection = getEntriesCollection();

      // Find entries that are scheduled and ready to publish
      const scheduledEntries = collection.find({
        status: 'scheduled',
        scheduledAt: { '$lte': now },
      }) as Doc<Entry>[];

      if (scheduledEntries.length === 0) {
        return 0;
      }

      console.log(`[Scheduler] Found ${scheduledEntries.length} entries to publish`);

      let published = 0;

      for (const entry of scheduledEntries) {
        try {
          // Execute beforePublish hook
          await hookSystem.execute('entry:beforePublish', { id: entry.id, entry });

          // Update entry status
          entry.status = 'published';
          entry.publishedAt = now;
          entry.updatedAt = now;
          collection.update(entry);

          // Execute afterPublish hook
          await hookSystem.execute('entry:afterPublish', { entry });

          published++;
          this.publishedCount++;
          console.log(`[Scheduler] Published: ${entry.title} (${entry.id})`);
        } catch (error) {
          console.error(`[Scheduler] Failed to publish entry ${entry.id}:`, error);
        }
      }

      return published;
    } catch (error) {
      console.error('[Scheduler] Error checking scheduled entries:', error);
      return 0;
    }
  }

  /**
   * Get scheduler statistics
   */
  getStats(): SchedulerStats {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      nextRun: this.isRunning && this.lastRun
        ? this.lastRun + this.intervalMs
        : null,
      publishedCount: this.publishedCount,
      intervalMs: this.intervalMs,
    };
  }

  /**
   * Get upcoming scheduled entries
   */
  getUpcoming(limit = 10): Doc<Entry>[] {
    const collection = getEntriesCollection();
    const now = Date.now();

    return collection
      .chain()
      .find({
        status: 'scheduled',
        scheduledAt: { '$gt': now },
      })
      .simplesort('scheduledAt')
      .limit(limit)
      .data();
  }

  /**
   * Schedule an entry for publishing
   */
  async scheduleEntry(entryId: string, scheduledAt: number): Promise<Entry> {
    const collection = getEntriesCollection();
    const entry = collection.findOne({ id: entryId });

    if (!entry) {
      throw new Error('Entry not found');
    }

    if (scheduledAt <= Date.now()) {
      throw new Error('Scheduled time must be in the future');
    }

    entry.status = 'scheduled';
    entry.scheduledAt = scheduledAt;
    entry.updatedAt = Date.now();

    collection.update(entry);

    console.log(`[Scheduler] Entry ${entry.id} scheduled for ${new Date(scheduledAt).toISOString()}`);

    return entry;
  }

  /**
   * Cancel scheduled publishing
   */
  async cancelSchedule(entryId: string): Promise<Entry> {
    const collection = getEntriesCollection();
    const entry = collection.findOne({ id: entryId });

    if (!entry) {
      throw new Error('Entry not found');
    }

    if (entry.status !== 'scheduled') {
      throw new Error('Entry is not scheduled');
    }

    entry.status = 'draft';
    entry.scheduledAt = undefined;
    entry.updatedAt = Date.now();

    collection.update(entry);

    console.log(`[Scheduler] Schedule cancelled for entry ${entry.id}`);

    return entry;
  }
}

// Export singleton instance
export const schedulerService = new SchedulerService();
