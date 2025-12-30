/**
 * MCP System Tools
 * Tools for search, scheduling, and audit functionality
 */

import { z } from 'zod';
import { searchService } from '../../services/search.service.js';
import { schedulerService } from '../../services/scheduler.service.js';
import { auditService } from '../../services/audit.service.js';

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
};
