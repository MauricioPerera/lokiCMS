/**
 * MCP System Tools
 * Tools for search, scheduling, and audit functionality
 */

import { z } from 'zod';
import { searchService } from '../../services/search.service.js';
import { schedulerService } from '../../services/scheduler.service.js';
import { auditService } from '../../services/audit.service.js';
import { revisionService } from '../../services/revision.service.js';
import { webhookService } from '../../services/webhook.service.js';
import { backupService } from '../../services/backup.service.js';

// Tool definitions for system features
export const systemTools = {
  // ==========================================================================
  // Search Tools
  // ==========================================================================

  search: {
    description: 'Search across all content in the CMS. Returns entries, content types, and users matching the query.',
    inputSchema: z.object({
      query: z.string().min(2).describe('Search query (minimum 2 characters)'),
      types: z.array(z.enum(['entry', 'content-type', 'user'])).optional()
        .describe('Filter by resource types (default: all)'),
      contentTypes: z.array(z.string()).optional()
        .describe('Filter entries by content type slugs'),
      status: z.string().optional()
        .describe('Filter entries by status (draft, published, etc.)'),
      limit: z.number().optional().default(20)
        .describe('Maximum results to return'),
    }),
    handler: async (input: {
      query: string;
      types?: ('entry' | 'content-type' | 'user')[];
      contentTypes?: string[];
      status?: string;
      limit?: number;
    }) => {
      try {
        const result = await searchService.search({
          query: input.query,
          types: input.types,
          contentTypes: input.contentTypes,
          status: input.status,
          limit: input.limit,
        });
        return result;
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Search failed' };
      }
    },
  },

  search_in_content_type: {
    description: 'Search within a specific content type',
    inputSchema: z.object({
      contentType: z.string().describe('Content type slug to search in'),
      query: z.string().min(2).describe('Search query'),
      status: z.string().optional().describe('Filter by status'),
      limit: z.number().optional().default(20),
    }),
    handler: async (input: {
      contentType: string;
      query: string;
      status?: string;
      limit?: number;
    }) => {
      try {
        const result = await searchService.searchInContentType(
          input.contentType,
          input.query,
          { status: input.status, limit: input.limit }
        );
        return result;
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Search failed' };
      }
    },
  },

  search_suggest: {
    description: 'Get search suggestions based on partial query',
    inputSchema: z.object({
      query: z.string().min(2).describe('Partial search query'),
      limit: z.number().optional().default(5),
    }),
    handler: async (input: { query: string; limit?: number }) => {
      try {
        const suggestions = await searchService.suggest(input.query, input.limit);
        return { suggestions };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Suggest failed' };
      }
    },
  },

  // ==========================================================================
  // Scheduler Tools
  // ==========================================================================

  scheduler_status: {
    description: 'Get the status of the entry scheduling system',
    inputSchema: z.object({}),
    handler: async () => {
      const stats = schedulerService.getStats();
      return {
        ...stats,
        nextRunISO: stats.nextRun ? new Date(stats.nextRun).toISOString() : null,
        lastRunISO: stats.lastRun ? new Date(stats.lastRun).toISOString() : null,
      };
    },
  },

  scheduler_upcoming: {
    description: 'Get entries scheduled for future publishing',
    inputSchema: z.object({
      limit: z.number().optional().default(10),
    }),
    handler: async (input: { limit?: number }) => {
      const entries = schedulerService.getUpcoming(input.limit);
      return {
        entries: entries.map(e => ({
          id: e.id,
          title: e.title,
          slug: e.slug,
          contentType: e.contentTypeSlug,
          scheduledAt: e.scheduledAt,
          scheduledAtISO: e.scheduledAt ? new Date(e.scheduledAt).toISOString() : null,
        })),
        total: entries.length,
      };
    },
  },

  schedule_entry: {
    description: 'Schedule an entry for future publishing',
    inputSchema: z.object({
      entryId: z.string().describe('ID of the entry to schedule'),
      scheduledAt: z.string().describe('ISO date string for when to publish (e.g., "2024-12-31T12:00:00Z")'),
    }),
    handler: async (input: { entryId: string; scheduledAt: string }) => {
      try {
        const timestamp = new Date(input.scheduledAt).getTime();
        if (isNaN(timestamp)) {
          return { error: 'Invalid date format' };
        }
        const entry = await schedulerService.scheduleEntry(input.entryId, timestamp);
        return {
          message: 'Entry scheduled successfully',
          entry: {
            id: entry.id,
            title: entry.title,
            status: entry.status,
            scheduledAtISO: entry.scheduledAt ? new Date(entry.scheduledAt).toISOString() : null,
          },
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to schedule entry' };
      }
    },
  },

  cancel_schedule: {
    description: 'Cancel scheduled publishing for an entry',
    inputSchema: z.object({
      entryId: z.string().describe('ID of the scheduled entry'),
    }),
    handler: async (input: { entryId: string }) => {
      try {
        const entry = await schedulerService.cancelSchedule(input.entryId);
        return {
          message: 'Schedule cancelled',
          entry: { id: entry.id, title: entry.title, status: entry.status },
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to cancel schedule' };
      }
    },
  },

  // ==========================================================================
  // Audit Tools
  // ==========================================================================

  audit_recent: {
    description: 'Get recent audit log entries showing all system activity',
    inputSchema: z.object({
      limit: z.number().optional().default(20),
    }),
    handler: async (input: { limit?: number }) => {
      try {
        const logs = await auditService.getRecentActivity(input.limit);
        return {
          logs: logs.map(l => ({
            ...l,
            timestampISO: new Date(l.timestamp).toISOString(),
          })),
          total: logs.length,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to fetch audit logs' };
      }
    },
  },

  audit_query: {
    description: 'Query audit logs with filters',
    inputSchema: z.object({
      action: z.enum(['create', 'update', 'delete', 'publish', 'unpublish', 'schedule', 'login', 'logout', 'password_change', 'api_key_create', 'api_key_revoke', 'media_upload', 'media_delete', 'settings_change']).optional(),
      resource: z.enum(['entry', 'content-type', 'taxonomy', 'term', 'user', 'media', 'api-key', 'settings', 'system']).optional(),
      resourceId: z.string().optional(),
      userId: z.string().optional(),
      limit: z.number().optional().default(50),
    }),
    handler: async (input: {
      action?: string;
      resource?: string;
      resourceId?: string;
      userId?: string;
      limit?: number;
    }) => {
      try {
        const result = await auditService.query(
          {
            action: input.action as any,
            resource: input.resource as any,
            resourceId: input.resourceId,
            userId: input.userId,
          },
          { limit: input.limit }
        );
        return {
          ...result,
          logs: result.logs.map(l => ({
            ...l,
            timestampISO: new Date(l.timestamp).toISOString(),
          })),
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to query audit logs' };
      }
    },
  },

  audit_resource_history: {
    description: 'Get the change history for a specific resource',
    inputSchema: z.object({
      resource: z.enum(['entry', 'content-type', 'taxonomy', 'term', 'user', 'media']),
      resourceId: z.string(),
      limit: z.number().optional().default(50),
    }),
    handler: async (input: { resource: string; resourceId: string; limit?: number }) => {
      try {
        const logs = await auditService.getResourceHistory(
          input.resource as any,
          input.resourceId,
          input.limit
        );
        return {
          logs: logs.map(l => ({
            ...l,
            timestampISO: new Date(l.timestamp).toISOString(),
          })),
          total: logs.length,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to fetch history' };
      }
    },
  },

  audit_stats: {
    description: 'Get audit log statistics',
    inputSchema: z.object({}),
    handler: async () => {
      try {
        const stats = await auditService.getStats();
        return stats;
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to fetch stats' };
      }
    },
  },

  // ==========================================================================
  // Revision Tools
  // ==========================================================================

  revision_list: {
    description: 'Get revision history for an entry',
    inputSchema: z.object({
      entryId: z.string().describe('ID of the entry'),
      limit: z.number().optional().default(20),
    }),
    handler: async (input: { entryId: string; limit?: number }) => {
      try {
        const revisions = await revisionService.getRevisions(input.entryId, input.limit);
        return {
          revisions: revisions.map(r => ({
            ...r,
            createdAtISO: new Date(r.createdAt).toISOString(),
          })),
          total: revisions.length,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to fetch revisions' };
      }
    },
  },

  revision_compare: {
    description: 'Compare two revisions and see what changed',
    inputSchema: z.object({
      revisionId1: z.string().describe('First revision ID'),
      revisionId2: z.string().describe('Second revision ID'),
    }),
    handler: async (input: { revisionId1: string; revisionId2: string }) => {
      try {
        const diffs = await revisionService.compareRevisions(input.revisionId1, input.revisionId2);
        return { diffs, totalChanges: diffs.length };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to compare revisions' };
      }
    },
  },

  revision_stats: {
    description: 'Get revision statistics',
    inputSchema: z.object({}),
    handler: async () => {
      try {
        return await revisionService.getStats();
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to fetch stats' };
      }
    },
  },

  // ==========================================================================
  // Webhook Tools
  // ==========================================================================

  webhook_list: {
    description: 'List all configured webhooks',
    inputSchema: z.object({}),
    handler: async () => {
      try {
        const webhooks = await webhookService.list();
        return {
          webhooks: webhooks.map(w => ({
            id: w.id,
            name: w.name,
            url: w.url,
            events: w.events,
            isActive: w.isActive,
            successCount: w.successCount,
            failureCount: w.failureCount,
          })),
          total: webhooks.length,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to list webhooks' };
      }
    },
  },

  webhook_create: {
    description: 'Create a new webhook',
    inputSchema: z.object({
      name: z.string().describe('Webhook name'),
      url: z.string().describe('Webhook URL'),
      events: z.array(z.string()).describe('Events to subscribe to (e.g., entry:create, entry:publish)'),
      secret: z.string().optional().describe('Secret for HMAC signature'),
    }),
    handler: async (input: { name: string; url: string; events: string[]; secret?: string }) => {
      try {
        const webhook = await webhookService.create({
          name: input.name,
          url: input.url,
          events: input.events as any,
          secret: input.secret,
        });
        return { message: 'Webhook created', webhook: { id: webhook.id, name: webhook.name } };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to create webhook' };
      }
    },
  },

  webhook_test: {
    description: 'Test a webhook by sending a test event',
    inputSchema: z.object({
      webhookId: z.string().describe('ID of the webhook to test'),
    }),
    handler: async (input: { webhookId: string }) => {
      try {
        const result = await webhookService.test(input.webhookId);
        return result;
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to test webhook' };
      }
    },
  },

  webhook_stats: {
    description: 'Get webhook statistics',
    inputSchema: z.object({}),
    handler: async () => {
      try {
        return await webhookService.getStats();
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to fetch stats' };
      }
    },
  },

  // ==========================================================================
  // Backup Tools
  // ==========================================================================

  backup_create: {
    description: 'Create a full backup of the CMS',
    inputSchema: z.object({
      description: z.string().optional().describe('Description for this backup'),
    }),
    handler: async (input: { description?: string }) => {
      try {
        const backup = await backupService.createBackup({ description: input.description });
        return {
          message: 'Backup created successfully',
          backup: backup.metadata,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to create backup' };
      }
    },
  },

  backup_list: {
    description: 'List all available backups',
    inputSchema: z.object({}),
    handler: async () => {
      try {
        const backups = backupService.listBackups();
        const stats = backupService.getStats();
        return { backups, stats };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to list backups' };
      }
    },
  },

  backup_restore: {
    description: 'Restore from a backup',
    inputSchema: z.object({
      backupId: z.string().describe('ID of the backup to restore'),
      includeUsers: z.boolean().optional().describe('Include users in restore'),
      mergeMode: z.enum(['replace', 'merge', 'skip']).optional().describe('How to handle existing data'),
    }),
    handler: async (input: { backupId: string; includeUsers?: boolean; mergeMode?: 'replace' | 'merge' | 'skip' }) => {
      try {
        const result = await backupService.restoreFromBackup(input.backupId, {
          includeUsers: input.includeUsers,
          mergeMode: input.mergeMode,
        });
        return { message: 'Restore completed', ...result };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to restore backup' };
      }
    },
  },

  backup_stats: {
    description: 'Get backup statistics',
    inputSchema: z.object({}),
    handler: async () => {
      try {
        return backupService.getStats();
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to fetch stats' };
      }
    },
  },
};
