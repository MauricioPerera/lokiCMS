/**
 * Audit Service
 * Track all changes to content, users, and system events
 */

import { nanoid } from 'nanoid';
import { addPluginCollection, getPluginCollection } from '../db/index.js';
import { hookSystem } from '../plugins/index.js';
import type { Collection, Doc } from '../lib/lokijs/index.js';

// Audit log entry interface
export interface AuditLogEntry {
  id: string;
  timestamp: number;
  action: AuditAction;
  resource: AuditResource;
  resourceId: string;
  resourceTitle?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    fields?: string[];
  };
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'publish'
  | 'unpublish'
  | 'schedule'
  | 'login'
  | 'logout'
  | 'password_change'
  | 'api_key_create'
  | 'api_key_revoke'
  | 'media_upload'
  | 'media_delete'
  | 'settings_change';

export type AuditResource =
  | 'entry'
  | 'content-type'
  | 'taxonomy'
  | 'term'
  | 'user'
  | 'media'
  | 'api-key'
  | 'settings'
  | 'system';

export interface AuditLogFilters {
  action?: AuditAction | AuditAction[];
  resource?: AuditResource | AuditResource[];
  resourceId?: string;
  userId?: string;
  startDate?: number;
  endDate?: number;
}

export interface AuditLogPagination {
  limit?: number;
  offset?: number;
}

export interface AuditLogResponse {
  logs: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

const COLLECTION_NAME = '_audit_log';

export class AuditService {
  private collection: Collection<AuditLogEntry> | null = null;
  private maxRetention = 90 * 24 * 60 * 60 * 1000; // 90 days in ms

  /**
   * Initialize the audit log collection
   */
  async initialize(): Promise<void> {
    this.collection = addPluginCollection<AuditLogEntry>(COLLECTION_NAME, {
      indices: ['timestamp', 'action', 'resource', 'resourceId', 'userId'],
    });
    console.log('[AuditLog] Collection initialized');

    // Register hooks for automatic logging
    this.registerHooks();

    // Clean old entries
    this.cleanOldEntries();
  }

  /**
   * Register hooks for automatic audit logging
   */
  private registerHooks(): void {
    const PLUGIN_NAME = '_audit_log';

    // Entry hooks
    hookSystem.register('entry:afterCreate', PLUGIN_NAME, async (payload) => {
      const entry = payload.entry as Record<string, unknown>;
      await this.log({
        action: 'create',
        resource: 'entry',
        resourceId: entry.id as string,
        resourceTitle: entry.title as string,
        userId: entry.authorId as string,
        userName: entry.authorName as string,
        changes: { after: entry.content as Record<string, unknown> },
      });
      return payload;
    });

    hookSystem.register('entry:afterUpdate', PLUGIN_NAME, async (payload) => {
      const entry = payload.entry as Record<string, unknown>;
      const previous = payload.previousEntry as Record<string, unknown> | undefined;
      await this.log({
        action: 'update',
        resource: 'entry',
        resourceId: entry.id as string,
        resourceTitle: entry.title as string,
        userId: entry.authorId as string,
        changes: {
          before: previous?.content as Record<string, unknown>,
          after: entry.content as Record<string, unknown>,
        },
      });
      return payload;
    });

    hookSystem.register('entry:afterDelete', PLUGIN_NAME, async (payload) => {
      await this.log({
        action: 'delete',
        resource: 'entry',
        resourceId: payload.id,
      });
      return payload;
    });

    hookSystem.register('entry:afterPublish', PLUGIN_NAME, async (payload) => {
      const entry = payload.entry as Record<string, unknown>;
      await this.log({
        action: 'publish',
        resource: 'entry',
        resourceId: entry.id as string,
        resourceTitle: entry.title as string,
      });
      return payload;
    });

    hookSystem.register('entry:afterUnpublish', PLUGIN_NAME, async (payload) => {
      const entry = payload.entry as Record<string, unknown>;
      await this.log({
        action: 'unpublish',
        resource: 'entry',
        resourceId: entry.id as string,
        resourceTitle: entry.title as string,
      });
      return payload;
    });

    // User hooks
    hookSystem.register('user:afterCreate', PLUGIN_NAME, async (payload) => {
      const user = payload.user as Record<string, unknown>;
      await this.log({
        action: 'create',
        resource: 'user',
        resourceId: user.id as string,
        resourceTitle: user.name as string,
        metadata: { email: user.email, role: user.role },
      });
      return payload;
    });

    hookSystem.register('user:afterUpdate', PLUGIN_NAME, async (payload) => {
      const user = payload.user as Record<string, unknown>;
      await this.log({
        action: 'update',
        resource: 'user',
        resourceId: user.id as string,
        resourceTitle: user.name as string,
      });
      return payload;
    });

    hookSystem.register('user:afterDelete', PLUGIN_NAME, async (payload) => {
      await this.log({
        action: 'delete',
        resource: 'user',
        resourceId: payload.id,
      });
      return payload;
    });

    console.log('[AuditLog] Hooks registered');
  }

  /**
   * Log an audit event
   */
  async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
    if (!this.collection) {
      this.collection = getPluginCollection<AuditLogEntry>(COLLECTION_NAME);
    }

    if (!this.collection) {
      console.error('[AuditLog] Collection not available');
      throw new Error('Audit log collection not initialized');
    }

    const logEntry: AuditLogEntry = {
      id: nanoid(),
      timestamp: Date.now(),
      ...entry,
    };

    this.collection.insert(logEntry);

    return logEntry;
  }

  /**
   * Query audit logs
   */
  async query(
    filters: AuditLogFilters = {},
    pagination: AuditLogPagination = {}
  ): Promise<AuditLogResponse> {
    if (!this.collection) {
      this.collection = getPluginCollection<AuditLogEntry>(COLLECTION_NAME);
    }

    if (!this.collection) {
      return { logs: [], total: 0, limit: 0, offset: 0 };
    }

    const { limit = 50, offset = 0 } = pagination;

    // Build query
    let chain = this.collection.chain();

    // Apply filters
    if (filters.action) {
      if (Array.isArray(filters.action)) {
        chain = chain.find({ action: { '$in': filters.action } });
      } else {
        chain = chain.find({ action: filters.action });
      }
    }

    if (filters.resource) {
      if (Array.isArray(filters.resource)) {
        chain = chain.find({ resource: { '$in': filters.resource } });
      } else {
        chain = chain.find({ resource: filters.resource });
      }
    }

    if (filters.resourceId) {
      chain = chain.find({ resourceId: filters.resourceId });
    }

    if (filters.userId) {
      chain = chain.find({ userId: filters.userId });
    }

    if (filters.startDate) {
      chain = chain.find({ timestamp: { '$gte': filters.startDate } });
    }

    if (filters.endDate) {
      chain = chain.find({ timestamp: { '$lte': filters.endDate } });
    }

    // Get total before pagination
    const total = chain.count();

    // Sort and paginate
    const logs = chain
      .simplesort('timestamp', true) // descending
      .offset(offset)
      .limit(limit)
      .data();

    return {
      logs,
      total,
      limit,
      offset,
    };
  }

  /**
   * Get logs for a specific resource
   */
  async getResourceHistory(
    resource: AuditResource,
    resourceId: string,
    limit = 50
  ): Promise<AuditLogEntry[]> {
    const result = await this.query(
      { resource, resourceId },
      { limit }
    );
    return result.logs;
  }

  /**
   * Get logs for a specific user
   */
  async getUserActivity(
    userId: string,
    limit = 50
  ): Promise<AuditLogEntry[]> {
    const result = await this.query(
      { userId },
      { limit }
    );
    return result.logs;
  }

  /**
   * Get recent activity
   */
  async getRecentActivity(limit = 20): Promise<AuditLogEntry[]> {
    const result = await this.query({}, { limit });
    return result.logs;
  }

  /**
   * Clean old audit entries
   */
  private cleanOldEntries(): void {
    if (!this.collection) return;

    const cutoff = Date.now() - this.maxRetention;
    const oldEntries = this.collection.find({
      timestamp: { '$lt': cutoff },
    });

    if (oldEntries.length > 0) {
      this.collection.findAndRemove({
        timestamp: { '$lt': cutoff },
      });
      console.log(`[AuditLog] Cleaned ${oldEntries.length} old entries`);
    }
  }

  /**
   * Get audit statistics
   */
  async getStats(): Promise<{
    total: number;
    byAction: Record<string, number>;
    byResource: Record<string, number>;
    last24h: number;
    last7d: number;
  }> {
    if (!this.collection) {
      return {
        total: 0,
        byAction: {},
        byResource: {},
        last24h: 0,
        last7d: 0,
      };
    }

    const all = this.collection.find();
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const byAction: Record<string, number> = {};
    const byResource: Record<string, number> = {};
    let last24h = 0;
    let last7d = 0;

    for (const entry of all) {
      byAction[entry.action] = (byAction[entry.action] || 0) + 1;
      byResource[entry.resource] = (byResource[entry.resource] || 0) + 1;

      if (entry.timestamp > now - day) last24h++;
      if (entry.timestamp > now - 7 * day) last7d++;
    }

    return {
      total: all.length,
      byAction,
      byResource,
      last24h,
      last7d,
    };
  }
}

// Export singleton instance
export const auditService = new AuditService();
