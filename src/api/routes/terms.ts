/**
 * Terms Routes
 * CRUD operations for taxonomy terms
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { termService, taxonomyService } from '../../services/index.js';
import {
  CreateTermSchema,
  UpdateTermSchema,
} from '../../models/index.js';
import { auth, optionalAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/roles.js';
import { z } from 'zod';

const termRoutes = new Hono();

// List terms for a taxonomy
termRoutes.get('/taxonomy/:taxonomySlug', optionalAuth, async (c) => {
  try {
    const taxonomySlug = c.req.param('taxonomySlug');
    const tree = c.req.query('tree') === 'true';

    const taxonomy = await taxonomyService.findBySlug(taxonomySlug);
    if (!taxonomy) {
      return c.json({ error: 'Taxonomy not found' }, 404);
    }

    if (tree && taxonomy.hierarchical) {
      const terms = await termService.getTermTree(taxonomy.id);
      return c.json({ terms, taxonomy });
    }

    const terms = await termService.findByTaxonomySlug(taxonomySlug);
    return c.json({ terms, taxonomy });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list terms';
    return c.json({ error: message }, 500);
  }
});

// Get term by ID
termRoutes.get('/id/:id', optionalAuth, async (c) => {
  try {
    const id = c.req.param('id');
    const term = await termService.findById(id);

    if (!term) {
      return c.json({ error: 'Term not found' }, 404);
    }

    return c.json({ term });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get term';
    return c.json({ error: message }, 500);
  }
});

// Get term by taxonomy and slug
termRoutes.get('/:taxonomySlug/:termSlug', optionalAuth, async (c) => {
  try {
    const taxonomySlug = c.req.param('taxonomySlug');
    const termSlug = c.req.param('termSlug');
    const term = await termService.findBySlug(termSlug, taxonomySlug);

    if (!term) {
      return c.json({ error: 'Term not found' }, 404);
    }

    return c.json({ term });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get term';
    return c.json({ error: message }, 500);
  }
});

// Get children of a term
termRoutes.get('/id/:id/children', optionalAuth, async (c) => {
  try {
    const id = c.req.param('id');
    const children = await termService.getChildren(id);
    return c.json({ terms: children });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get children';
    return c.json({ error: message }, 500);
  }
});

// Create term
termRoutes.post(
  '/',
  auth,
  requirePermission('terms:write'),
  zValidator('json', CreateTermSchema),
  async (c) => {
    try {
      const input = c.req.valid('json');
      const term = await termService.create(input);
      return c.json({ term }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create term';
      return c.json({ error: message }, 400);
    }
  }
);

// Update term
termRoutes.put(
  '/id/:id',
  auth,
  requirePermission('terms:write'),
  zValidator('json', UpdateTermSchema),
  async (c) => {
    try {
      const id = c.req.param('id');
      const input = c.req.valid('json');

      const existing = await termService.findById(id);
      if (!existing) {
        return c.json({ error: 'Term not found' }, 404);
      }

      const term = await termService.update(id, input);
      return c.json({ term });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update term';
      return c.json({ error: message }, 400);
    }
  }
);

// Delete term
termRoutes.delete(
  '/id/:id',
  auth,
  requirePermission('terms:delete'),
  async (c) => {
    try {
      const id = c.req.param('id');

      const existing = await termService.findById(id);
      if (!existing) {
        return c.json({ error: 'Term not found' }, 404);
      }

      await termService.delete(id);
      return c.json({ message: 'Term deleted' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete term';
      return c.json({ error: message }, 400);
    }
  }
);

// Reorder terms
termRoutes.post(
  '/reorder',
  auth,
  requirePermission('terms:write'),
  zValidator('json', z.object({ termIds: z.array(z.string()) })),
  async (c) => {
    try {
      const { termIds } = c.req.valid('json');
      await termService.reorder(termIds);
      return c.json({ message: 'Terms reordered' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reorder terms';
      return c.json({ error: message }, 400);
    }
  }
);

export { termRoutes };
