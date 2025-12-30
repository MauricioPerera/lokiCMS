/**
 * Webhook Routes
 * Manage webhooks for external integrations
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { webhookService } from '../../services/webhook.service.js';
import { auth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/roles.js';
import type { WebhookEvent } from '../../services/webhook.service.js';

const webhookRoutes = new Hono();

// Validation schemas
const WebhookEventSchema = z.enum([
  'entry:create',
  'entry:update',
  'entry:delete',
  'entry:publish',
  'entry:unpublish',
  'user:create',
  'user:update',
  'user:delete',
  'content-type:create',
  'content-type:update',
  'content-type:delete',
]);

const CreateWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  secret: z.string().optional(),
  events: z.array(WebhookEventSchema).min(1),
  contentTypes: z.array(z.string()).optional(),
  headers: z.record(z.string()).optional(),
  retryCount: z.number().min(0).max(10).optional(),
  retryDelay: z.number().min(1000).max(60000).optional(),
});

const UpdateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  secret: z.string().optional(),
  events: z.array(WebhookEventSchema).min(1).optional(),
  contentTypes: z.array(z.string()).optional(),
  headers: z.record(z.string()).optional(),
  isActive: z.boolean().optional(),
  retryCount: z.number().min(0).max(10).optional(),
  retryDelay: z.number().min(1000).max(60000).optional(),
});

/**
 * List all webhooks
 * GET /api/webhooks
 */
webhookRoutes.get('/', auth, requirePermission('system:admin'), async (c) => {
  try {
    const webhooks = await webhookService.list();
    return c.json({
      webhooks: webhooks.map((w) => ({
        ...w,
        secret: w.secret ? '••••••••' : undefined, // Hide secret
      })),
      total: webhooks.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list webhooks';
    return c.json({ error: message }, 500);
  }
});

/**
 * Get a webhook
 * GET /api/webhooks/:id
 */
webhookRoutes.get('/:id', auth, requirePermission('system:admin'), async (c) => {
  try {
    const id = c.req.param('id');
    const webhook = await webhookService.get(id);

    if (!webhook) {
      return c.json({ error: 'Webhook not found' }, 404);
    }

    return c.json({
      webhook: {
        ...webhook,
        secret: webhook.secret ? '••••••••' : undefined,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get webhook';
    return c.json({ error: message }, 500);
  }
});

/**
 * Create a webhook
 * POST /api/webhooks
 */
webhookRoutes.post(
  '/',
  auth,
  requirePermission('system:admin'),
  zValidator('json', CreateWebhookSchema),
  async (c) => {
    try {
      const input = c.req.valid('json');
      const webhook = await webhookService.create({
        name: input.name,
        url: input.url,
        secret: input.secret,
        events: input.events as WebhookEvent[],
        contentTypes: input.contentTypes,
        headers: input.headers,
        retryCount: input.retryCount,
        retryDelay: input.retryDelay,
      });

      return c.json({
        message: 'Webhook created',
        webhook: {
          ...webhook,
          secret: webhook.secret ? '••••••••' : undefined,
        },
      }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create webhook';
      return c.json({ error: message }, 400);
    }
  }
);

/**
 * Update a webhook
 * PUT /api/webhooks/:id
 */
webhookRoutes.put(
  '/:id',
  auth,
  requirePermission('system:admin'),
  zValidator('json', UpdateWebhookSchema),
  async (c) => {
    try {
      const id = c.req.param('id');
      const input = c.req.valid('json');

      const webhook = await webhookService.update(id, {
        name: input.name,
        url: input.url,
        secret: input.secret,
        events: input.events as WebhookEvent[] | undefined,
        contentTypes: input.contentTypes,
        headers: input.headers,
        isActive: input.isActive,
        retryCount: input.retryCount,
        retryDelay: input.retryDelay,
      });

      return c.json({
        message: 'Webhook updated',
        webhook: {
          ...webhook,
          secret: webhook.secret ? '••••••••' : undefined,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update webhook';
      return c.json({ error: message }, 400);
    }
  }
);

/**
 * Delete a webhook
 * DELETE /api/webhooks/:id
 */
webhookRoutes.delete('/:id', auth, requirePermission('system:admin'), async (c) => {
  try {
    const id = c.req.param('id');
    await webhookService.delete(id);

    return c.json({ message: 'Webhook deleted' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete webhook';
    return c.json({ error: message }, 400);
  }
});

/**
 * Test a webhook
 * POST /api/webhooks/:id/test
 */
webhookRoutes.post('/:id/test', auth, requirePermission('system:admin'), async (c) => {
  try {
    const id = c.req.param('id');
    const result = await webhookService.test(id);

    return c.json({
      message: result.success ? 'Test successful' : 'Test failed',
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to test webhook';
    return c.json({ error: message }, 400);
  }
});

/**
 * Get delivery history for a webhook
 * GET /api/webhooks/:id/deliveries
 */
webhookRoutes.get('/:id/deliveries', auth, requirePermission('system:admin'), async (c) => {
  try {
    const id = c.req.param('id');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 20;

    const deliveries = await webhookService.getDeliveries(id, Math.min(limit, 100));

    return c.json({
      deliveries,
      total: deliveries.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get deliveries';
    return c.json({ error: message }, 500);
  }
});

/**
 * Get webhook statistics
 * GET /api/webhooks/stats
 */
webhookRoutes.get('/stats', auth, requirePermission('system:admin'), async (c) => {
  try {
    const stats = await webhookService.getStats();
    return c.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get stats';
    return c.json({ error: message }, 500);
  }
});

/**
 * List available webhook events
 * GET /api/webhooks/events
 */
webhookRoutes.get('/events', auth, async (c) => {
  return c.json({
    events: [
      { event: 'entry:create', description: 'When a new entry is created' },
      { event: 'entry:update', description: 'When an entry is updated' },
      { event: 'entry:delete', description: 'When an entry is deleted' },
      { event: 'entry:publish', description: 'When an entry is published' },
      { event: 'entry:unpublish', description: 'When an entry is unpublished' },
      { event: 'user:create', description: 'When a new user is created' },
      { event: 'user:update', description: 'When a user is updated' },
      { event: 'user:delete', description: 'When a user is deleted' },
      { event: 'content-type:create', description: 'When a content type is created' },
      { event: 'content-type:update', description: 'When a content type is updated' },
      { event: 'content-type:delete', description: 'When a content type is deleted' },
    ],
  });
});

export { webhookRoutes };
