/**
 * Taxonomies Routes
 * CRUD operations for taxonomies
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { taxonomyService } from '../../services/index.js';
import {
  CreateTaxonomySchema,
  UpdateTaxonomySchema,
} from '../../models/index.js';
import { auth, optionalAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/roles.js';

const taxonomyRoutes = new Hono();

// List all taxonomies
taxonomyRoutes.get('/', optionalAuth, async (c) => {
  try {
    const taxonomies = await taxonomyService.findAll();
    return c.json({ taxonomies });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list taxonomies';
    return c.json({ error: message }, 500);
  }
});

// Get taxonomy by slug
taxonomyRoutes.get('/:slug', optionalAuth, async (c) => {
  try {
    const slug = c.req.param('slug');
    const taxonomy = await taxonomyService.findBySlug(slug);

    if (!taxonomy) {
      return c.json({ error: 'Taxonomy not found' }, 404);
    }

    return c.json({ taxonomy });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get taxonomy';
    return c.json({ error: message }, 500);
  }
});

// Get taxonomies for content type
taxonomyRoutes.get('/for/:contentType', optionalAuth, async (c) => {
  try {
    const contentType = c.req.param('contentType');
    const taxonomies = await taxonomyService.findByContentType(contentType);
    return c.json({ taxonomies });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list taxonomies';
    return c.json({ error: message }, 500);
  }
});

// Create taxonomy
taxonomyRoutes.post(
  '/',
  auth,
  requirePermission('taxonomies:write'),
  zValidator('json', CreateTaxonomySchema),
  async (c) => {
    try {
      const input = c.req.valid('json');
      const taxonomy = await taxonomyService.create(input);
      return c.json({ taxonomy }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create taxonomy';
      return c.json({ error: message }, 400);
    }
  }
);

// Update taxonomy
taxonomyRoutes.put(
  '/:slug',
  auth,
  requirePermission('taxonomies:write'),
  zValidator('json', UpdateTaxonomySchema),
  async (c) => {
    try {
      const slug = c.req.param('slug');
      const input = c.req.valid('json');

      const existing = await taxonomyService.findBySlug(slug);
      if (!existing) {
        return c.json({ error: 'Taxonomy not found' }, 404);
      }

      const taxonomy = await taxonomyService.update(existing.id, input);
      return c.json({ taxonomy });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update taxonomy';
      return c.json({ error: message }, 400);
    }
  }
);

// Delete taxonomy
taxonomyRoutes.delete(
  '/:slug',
  auth,
  requirePermission('taxonomies:delete'),
  async (c) => {
    try {
      const slug = c.req.param('slug');

      const existing = await taxonomyService.findBySlug(slug);
      if (!existing) {
        return c.json({ error: 'Taxonomy not found' }, 404);
      }

      await taxonomyService.delete(existing.id);
      return c.json({ message: 'Taxonomy deleted' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete taxonomy';
      return c.json({ error: message }, 400);
    }
  }
);

export { taxonomyRoutes };
