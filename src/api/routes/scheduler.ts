/**
 * Scheduler Routes
 * Manage scheduled entry publishing
 */

import { Hono } from 'hono';
import { schedulerService } from '../../services/scheduler.service.js';
import { auth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/roles.js';

const schedulerRoutes = new Hono();

/**
 * Get scheduler status
 * GET /api/scheduler/status
 */
schedulerRoutes.get('/status', auth, requirePermission('entries:read'), async (c) => {
  const stats = schedulerService.getStats();
  return c.json(stats);
});

/**
 * Get upcoming scheduled entries
 * GET /api/scheduler/upcoming
 */
schedulerRoutes.get('/upcoming', auth, requirePermission('entries:read'), async (c) => {
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 10;
  const entries = schedulerService.getUpcoming(Math.min(limit, 50));

  return c.json({
    entries: entries.map(e => ({
      id: e.id,
      title: e.title,
      slug: e.slug,
      contentType: e.contentTypeSlug,
      scheduledAt: e.scheduledAt,
      scheduledAtISO: e.scheduledAt ? new Date(e.scheduledAt).toISOString() : null,
    })),
    total: entries.length,
  });
});

/**
 * Schedule an entry for publishing
 * POST /api/scheduler/schedule
 */
schedulerRoutes.post('/schedule', auth, requirePermission('entries:update'), async (c) => {
  try {
    const body = await c.req.json();
    const { entryId, scheduledAt } = body;

    if (!entryId) {
      return c.json({ error: 'entryId is required' }, 400);
    }

    if (!scheduledAt) {
      return c.json({ error: 'scheduledAt is required' }, 400);
    }

    // Parse date if string
    const timestamp = typeof scheduledAt === 'string'
      ? new Date(scheduledAt).getTime()
      : scheduledAt;

    if (isNaN(timestamp)) {
      return c.json({ error: 'Invalid scheduledAt date' }, 400);
    }

    const entry = await schedulerService.scheduleEntry(entryId, timestamp);

    return c.json({
      message: 'Entry scheduled successfully',
      entry: {
        id: entry.id,
        title: entry.title,
        status: entry.status,
        scheduledAt: entry.scheduledAt,
        scheduledAtISO: entry.scheduledAt ? new Date(entry.scheduledAt).toISOString() : null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to schedule entry';
    return c.json({ error: message }, 400);
  }
});

/**
 * Cancel scheduled publishing
 * POST /api/scheduler/cancel
 */
schedulerRoutes.post('/cancel', auth, requirePermission('entries:update'), async (c) => {
  try {
    const body = await c.req.json();
    const { entryId } = body;

    if (!entryId) {
      return c.json({ error: 'entryId is required' }, 400);
    }

    const entry = await schedulerService.cancelSchedule(entryId);

    return c.json({
      message: 'Schedule cancelled successfully',
      entry: {
        id: entry.id,
        title: entry.title,
        status: entry.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel schedule';
    return c.json({ error: message }, 400);
  }
});

/**
 * Manually trigger scheduler check (admin only)
 * POST /api/scheduler/trigger
 */
schedulerRoutes.post('/trigger', auth, requirePermission('system:admin'), async (c) => {
  const published = await schedulerService.checkScheduledEntries();

  return c.json({
    message: `Scheduler check complete`,
    published,
  });
});

export { schedulerRoutes };
