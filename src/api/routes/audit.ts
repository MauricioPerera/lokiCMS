/**
 * Audit Routes
 * View and query audit logs
 */

import { Hono } from 'hono';
import { auditService } from '../../services/audit.service.js';
import { auth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/roles.js';
import type { AuditAction, AuditResource } from '../../services/audit.service.js';

const auditRoutes = new Hono();

/**
 * Get recent audit logs
 * GET /api/audit
 */
auditRoutes.get('/', auth, requirePermission('system:admin'), async (c) => {
  try {
    const query = c.req.query();

    // Parse filters
    const filters: {
      action?: AuditAction | AuditAction[];
      resource?: AuditResource | AuditResource[];
      resourceId?: string;
      userId?: string;
      startDate?: number;
      endDate?: number;
    } = {};

    if (query['action']) {
      const actions = query['action'].split(',') as AuditAction[];
      filters.action = actions.length === 1 ? actions[0] : actions;
    }

    if (query['resource']) {
      const resources = query['resource'].split(',') as AuditResource[];
      filters.resource = resources.length === 1 ? resources[0] : resources;
    }

    if (query['resourceId']) {
      filters.resourceId = query['resourceId'];
    }

    if (query['userId']) {
      filters.userId = query['userId'];
    }

    if (query['startDate']) {
      filters.startDate = parseInt(query['startDate']);
    }

    if (query['endDate']) {
      filters.endDate = parseInt(query['endDate']);
    }

    // Parse pagination
    const limit = query['limit'] ? parseInt(query['limit']) : 50;
    const offset = query['offset'] ? parseInt(query['offset']) : 0;

    const result = await auditService.query(filters, {
      limit: Math.min(limit, 200),
      offset,
    });

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch audit logs';
    return c.json({ error: message }, 500);
  }
});

/**
 * Get audit statistics
 * GET /api/audit/stats
 */
auditRoutes.get('/stats', auth, requirePermission('system:admin'), async (c) => {
  try {
    const stats = await auditService.getStats();
    return c.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch audit stats';
    return c.json({ error: message }, 500);
  }
});

/**
 * Get history for a specific resource
 * GET /api/audit/resource/:resource/:resourceId
 */
auditRoutes.get('/resource/:resource/:resourceId', auth, requirePermission('system:admin'), async (c) => {
  try {
    const resource = c.req.param('resource') as AuditResource;
    const resourceId = c.req.param('resourceId');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 50;

    const logs = await auditService.getResourceHistory(resource, resourceId, Math.min(limit, 100));

    return c.json({ logs, total: logs.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch resource history';
    return c.json({ error: message }, 500);
  }
});

/**
 * Get activity for a specific user
 * GET /api/audit/user/:userId
 */
auditRoutes.get('/user/:userId', auth, requirePermission('system:admin'), async (c) => {
  try {
    const userId = c.req.param('userId');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 50;

    const logs = await auditService.getUserActivity(userId, Math.min(limit, 100));

    return c.json({ logs, total: logs.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch user activity';
    return c.json({ error: message }, 500);
  }
});

/**
 * Get my activity (for authenticated user)
 * GET /api/audit/me
 */
auditRoutes.get('/me', auth, async (c) => {
  try {
    const session = c.get('session');
    if (!session?.user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 50;
    const logs = await auditService.getUserActivity(session.user.id, Math.min(limit, 100));

    return c.json({ logs, total: logs.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch activity';
    return c.json({ error: message }, 500);
  }
});

export { auditRoutes };
