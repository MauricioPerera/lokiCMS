/**
 * Relationship Routes
 * Content relationships and references
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { relationshipService } from '../../services/relationship.service.js';
import { auth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/roles.js';

const relationshipRoutes = new Hono();

// Validation schemas
const DefinitionSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/),
  description: z.string().optional(),
  sourceContentType: z.string().min(1),
  targetContentType: z.string().min(1),
  cardinality: z.enum(['one-to-one', 'one-to-many', 'many-to-many']).optional(),
  required: z.boolean().optional(),
  bidirectional: z.boolean().optional(),
  inverseName: z.string().optional(),
});

const LinkSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  order: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Definition Routes
// ============================================================================

/**
 * Get all relationship definitions
 * GET /api/relationships/definitions
 */
relationshipRoutes.get('/definitions', auth, async (c) => {
  try {
    const contentType = c.req.query('contentType');
    const definitions = await relationshipService.getDefinitions(contentType);

    return c.json({
      definitions,
      total: definitions.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get definitions';
    return c.json({ error: message }, 500);
  }
});

/**
 * Get a relationship definition
 * GET /api/relationships/definitions/:slug
 */
relationshipRoutes.get('/definitions/:slug', auth, async (c) => {
  try {
    const slug = c.req.param('slug');
    const definition = await relationshipService.getDefinition(slug);

    if (!definition) {
      return c.json({ error: 'Definition not found' }, 404);
    }

    return c.json({ definition });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get definition';
    return c.json({ error: message }, 500);
  }
});

/**
 * Create a relationship definition
 * POST /api/relationships/definitions
 */
relationshipRoutes.post(
  '/definitions',
  auth,
  requirePermission('system:admin'),
  zValidator('json', DefinitionSchema),
  async (c) => {
    try {
      const input = c.req.valid('json') as {
        name: string;
        slug: string;
        description?: string;
        sourceContentType: string;
        targetContentType: string;
        cardinality?: 'one-to-one' | 'one-to-many' | 'many-to-many';
        required?: boolean;
        bidirectional?: boolean;
        inverseName?: string;
      };
      const definition = await relationshipService.createDefinition(input);

      return c.json({ message: 'Definition created', definition }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create definition';
      return c.json({ error: message }, 400);
    }
  }
);

/**
 * Update a relationship definition
 * PUT /api/relationships/definitions/:slug
 */
relationshipRoutes.put(
  '/definitions/:slug',
  auth,
  requirePermission('system:admin'),
  zValidator('json', DefinitionSchema.partial()),
  async (c) => {
    try {
      const slug = c.req.param('slug');
      const input = c.req.valid('json');

      const definition = await relationshipService.updateDefinition(slug, input);

      return c.json({ message: 'Definition updated', definition });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update definition';
      return c.json({ error: message }, 400);
    }
  }
);

/**
 * Delete a relationship definition
 * DELETE /api/relationships/definitions/:slug
 */
relationshipRoutes.delete('/definitions/:slug', auth, requirePermission('system:admin'), async (c) => {
  try {
    const slug = c.req.param('slug');
    await relationshipService.deleteDefinition(slug);

    return c.json({ message: 'Definition deleted' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete definition';
    return c.json({ error: message }, 400);
  }
});

// ============================================================================
// Relationship Instance Routes
// ============================================================================

/**
 * Get related entries for an entry
 * GET /api/relationships/entries/:entryId
 */
relationshipRoutes.get('/entries/:entryId', auth, async (c) => {
  try {
    const entryId = c.req.param('entryId');
    const definitionSlug = c.req.query('definition');

    const related = await relationshipService.getRelated(entryId, definitionSlug);

    return c.json({
      relationships: related.map((r) => ({
        definition: r.definition.slug,
        name: r.definition.name,
        cardinality: r.definition.cardinality,
        entries: r.entries.map((e) => ({
          id: e.id,
          title: e.title,
          slug: e.slug,
          status: e.status,
          contentType: e.contentTypeSlug,
        })),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get relationships';
    return c.json({ error: message }, 500);
  }
});

/**
 * Create a relationship (link two entries)
 * POST /api/relationships/:definition/link
 */
relationshipRoutes.post(
  '/:definition/link',
  auth,
  requirePermission('content:update'),
  zValidator('json', LinkSchema),
  async (c) => {
    try {
      const definitionSlug = c.req.param('definition');
      const input = c.req.valid('json');

      const relationship = await relationshipService.link(
        definitionSlug,
        input.sourceId,
        input.targetId,
        { order: input.order, metadata: input.metadata }
      );

      return c.json({ message: 'Entries linked', relationship }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to link entries';
      return c.json({ error: message }, 400);
    }
  }
);

/**
 * Remove a relationship (unlink two entries)
 * POST /api/relationships/:definition/unlink
 */
relationshipRoutes.post(
  '/:definition/unlink',
  auth,
  requirePermission('content:update'),
  zValidator('json', z.object({
    sourceId: z.string().min(1),
    targetId: z.string().min(1),
  })),
  async (c) => {
    try {
      const definitionSlug = c.req.param('definition');
      const { sourceId, targetId } = c.req.valid('json');

      await relationshipService.unlink(definitionSlug, sourceId, targetId);

      return c.json({ message: 'Entries unlinked' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to unlink entries';
      return c.json({ error: message }, 400);
    }
  }
);

/**
 * Update relationship order
 * PUT /api/relationships/:definition/order
 */
relationshipRoutes.put(
  '/:definition/order',
  auth,
  requirePermission('content:update'),
  zValidator('json', z.object({
    sourceId: z.string().min(1),
    orderedTargetIds: z.array(z.string()),
  })),
  async (c) => {
    try {
      const definitionSlug = c.req.param('definition');
      const { sourceId, orderedTargetIds } = c.req.valid('json');

      await relationshipService.updateOrder(definitionSlug, sourceId, orderedTargetIds);

      return c.json({ message: 'Order updated' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update order';
      return c.json({ error: message }, 400);
    }
  }
);

// ============================================================================
// Stats
// ============================================================================

/**
 * Get relationship statistics
 * GET /api/relationships/stats
 */
relationshipRoutes.get('/stats', auth, async (c) => {
  try {
    const stats = await relationshipService.getStats();
    return c.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get stats';
    return c.json({ error: message }, 500);
  }
});

export { relationshipRoutes };
