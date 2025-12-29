/**
 * Content Types Routes
 * CRUD operations for content types
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { contentTypeService } from '../../services/index.js';
import {
  CreateContentTypeSchema,
  UpdateContentTypeSchema,
  FieldDefinitionSchema,
} from '../../models/index.js';
import { auth, optionalAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/roles.js';
import { z } from 'zod';

const contentTypeRoutes = new Hono();

// List all content types (public read, authenticated for details)
contentTypeRoutes.get('/', optionalAuth, async (c) => {
  try {
    const contentTypes = await contentTypeService.findAll();
    return c.json({ contentTypes });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list content types';
    return c.json({ error: message }, 500);
  }
});

// Get content type by slug
contentTypeRoutes.get('/:slug', optionalAuth, async (c) => {
  try {
    const slug = c.req.param('slug');
    const contentType = await contentTypeService.findBySlug(slug);

    if (!contentType) {
      return c.json({ error: 'Content type not found' }, 404);
    }

    // Get entries count
    const count = await contentTypeService.getEntriesCount(contentType.id);

    return c.json({ contentType, entriesCount: count });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get content type';
    return c.json({ error: message }, 500);
  }
});

// Create content type (admin only)
contentTypeRoutes.post(
  '/',
  auth,
  requirePermission('content-types:write'),
  zValidator('json', CreateContentTypeSchema),
  async (c) => {
    try {
      const input = c.req.valid('json');
      const contentType = await contentTypeService.create(input);
      return c.json({ contentType }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create content type';
      return c.json({ error: message }, 400);
    }
  }
);

// Update content type
contentTypeRoutes.put(
  '/:slug',
  auth,
  requirePermission('content-types:write'),
  zValidator('json', UpdateContentTypeSchema),
  async (c) => {
    try {
      const slug = c.req.param('slug');
      const input = c.req.valid('json');

      const existing = await contentTypeService.findBySlug(slug);
      if (!existing) {
        return c.json({ error: 'Content type not found' }, 404);
      }

      const contentType = await contentTypeService.update(existing.id, input);
      return c.json({ contentType });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update content type';
      return c.json({ error: message }, 400);
    }
  }
);

// Delete content type
contentTypeRoutes.delete(
  '/:slug',
  auth,
  requirePermission('content-types:delete'),
  async (c) => {
    try {
      const slug = c.req.param('slug');

      const existing = await contentTypeService.findBySlug(slug);
      if (!existing) {
        return c.json({ error: 'Content type not found' }, 404);
      }

      await contentTypeService.delete(existing.id);
      return c.json({ message: 'Content type deleted' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete content type';
      return c.json({ error: message }, 400);
    }
  }
);

// Add field to content type
contentTypeRoutes.post(
  '/:slug/fields',
  auth,
  requirePermission('content-types:write'),
  zValidator('json', FieldDefinitionSchema),
  async (c) => {
    try {
      const slug = c.req.param('slug');
      const field = c.req.valid('json');

      const existing = await contentTypeService.findBySlug(slug);
      if (!existing) {
        return c.json({ error: 'Content type not found' }, 404);
      }

      const contentType = await contentTypeService.addField(existing.id, field);
      return c.json({ contentType }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add field';
      return c.json({ error: message }, 400);
    }
  }
);

// Update field in content type
contentTypeRoutes.put(
  '/:slug/fields/:fieldName',
  auth,
  requirePermission('content-types:write'),
  zValidator('json', FieldDefinitionSchema.partial()),
  async (c) => {
    try {
      const slug = c.req.param('slug');
      const fieldName = c.req.param('fieldName');
      const updates = c.req.valid('json');

      const existing = await contentTypeService.findBySlug(slug);
      if (!existing) {
        return c.json({ error: 'Content type not found' }, 404);
      }

      const contentType = await contentTypeService.updateField(
        existing.id,
        fieldName,
        updates
      );
      return c.json({ contentType });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update field';
      return c.json({ error: message }, 400);
    }
  }
);

// Remove field from content type
contentTypeRoutes.delete(
  '/:slug/fields/:fieldName',
  auth,
  requirePermission('content-types:write'),
  async (c) => {
    try {
      const slug = c.req.param('slug');
      const fieldName = c.req.param('fieldName');

      const existing = await contentTypeService.findBySlug(slug);
      if (!existing) {
        return c.json({ error: 'Content type not found' }, 404);
      }

      const contentType = await contentTypeService.removeField(existing.id, fieldName);
      return c.json({ contentType });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove field';
      return c.json({ error: message }, 400);
    }
  }
);

export { contentTypeRoutes };
