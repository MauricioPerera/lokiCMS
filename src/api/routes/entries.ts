/**
 * Entries Routes
 * CRUD operations for content entries
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { entryService } from '../../services/index.js';
import {
  CreateEntrySchema,
  UpdateEntrySchema,
  EntryFiltersSchema,
  EntrySortSchema,
  EntryPaginationSchema,
} from '../../models/index.js';
import { auth, optionalAuth, requireSession } from '../middleware/auth.js';
import { requirePermission, canAccessOwned, hasPermission } from '../middleware/roles.js';
import { z } from 'zod';

const entryRoutes = new Hono();

// List entries with filters
entryRoutes.get('/', optionalAuth, async (c) => {
  try {
    const query = c.req.query();

    // Parse filters
    const filters = EntryFiltersSchema.parse({
      contentTypeId: query['contentTypeId'],
      contentTypeSlug: query['contentType'] || query['contentTypeSlug'],
      status: query['status'],
      authorId: query['authorId'],
      locale: query['locale'],
      search: query['search'],
      taxonomyTerms: query['terms'] ? query['terms'].split(',') : undefined,
      createdAfter: query['createdAfter'] ? parseInt(query['createdAfter']) : undefined,
      createdBefore: query['createdBefore'] ? parseInt(query['createdBefore']) : undefined,
      publishedAfter: query['publishedAfter'] ? parseInt(query['publishedAfter']) : undefined,
      publishedBefore: query['publishedBefore'] ? parseInt(query['publishedBefore']) : undefined,
    });

    // Parse sort
    const sort = query['sortBy']
      ? EntrySortSchema.parse({
          field: query['sortBy'],
          order: query['sortOrder'] || 'desc',
        })
      : undefined;

    // Parse pagination
    const pagination = EntryPaginationSchema.parse({
      page: query['page'] ? parseInt(query['page']) : 1,
      limit: query['limit'] ? parseInt(query['limit']) : 20,
    });

    // Non-authenticated users can only see published entries
    const session = c.get('session');
    if (!session) {
      filters.status = 'published';
    }

    const result = await entryService.findAll(filters, sort, pagination);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list entries';
    return c.json({ error: message }, 500);
  }
});

// Get entry by ID
entryRoutes.get('/id/:id', optionalAuth, async (c) => {
  try {
    const id = c.req.param('id');
    const entry = await entryService.findById(id);

    if (!entry) {
      return c.json({ error: 'Entry not found' }, 404);
    }

    // Check access for non-published entries
    const session = c.get('session');
    if (entry.status !== 'published' && !session) {
      return c.json({ error: 'Entry not found' }, 404);
    }

    return c.json({ entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get entry';
    return c.json({ error: message }, 500);
  }
});

// Get entry by content type and slug
entryRoutes.get('/:contentType/:slug', optionalAuth, async (c) => {
  try {
    const contentType = c.req.param('contentType');
    const slug = c.req.param('slug');
    const entry = await entryService.findBySlug(slug, contentType);

    if (!entry) {
      return c.json({ error: 'Entry not found' }, 404);
    }

    // Check access for non-published entries
    const session = c.get('session');
    if (entry.status !== 'published' && !session) {
      return c.json({ error: 'Entry not found' }, 404);
    }

    return c.json({ entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get entry';
    return c.json({ error: message }, 500);
  }
});

// Create entry
entryRoutes.post(
  '/',
  auth,
  requirePermission('entries:write'),
  zValidator('json', CreateEntrySchema),
  async (c) => {
    try {
      const session = requireSession(c);
      const input = c.req.valid('json');

      const entry = await entryService.create(
        input,
        session.user.id,
        session.user.name
      );
      return c.json({ entry }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create entry';
      return c.json({ error: message }, 400);
    }
  }
);

// Update entry
entryRoutes.put(
  '/id/:id',
  auth,
  zValidator('json', UpdateEntrySchema),
  async (c) => {
    try {
      const id = c.req.param('id');
      const input = c.req.valid('json');

      const existing = await entryService.findById(id);
      if (!existing) {
        return c.json({ error: 'Entry not found' }, 404);
      }

      // Check permission
      if (!canAccessOwned(c, 'entries:write', existing.authorId)) {
        return c.json({ error: 'Insufficient permissions' }, 403);
      }

      const entry = await entryService.update(id, input);
      return c.json({ entry });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update entry';
      return c.json({ error: message }, 400);
    }
  }
);

// Delete entry
entryRoutes.delete('/id/:id', auth, async (c) => {
  try {
    const id = c.req.param('id');

    const existing = await entryService.findById(id);
    if (!existing) {
      return c.json({ error: 'Entry not found' }, 404);
    }

    // Check permission
    if (!canAccessOwned(c, 'entries:delete', existing.authorId)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    await entryService.delete(id);
    return c.json({ message: 'Entry deleted' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete entry';
    return c.json({ error: message }, 400);
  }
});

// Publish entry
entryRoutes.post(
  '/id/:id/publish',
  auth,
  requirePermission('entries:publish'),
  async (c) => {
    try {
      const id = c.req.param('id');

      const existing = await entryService.findById(id);
      if (!existing) {
        return c.json({ error: 'Entry not found' }, 404);
      }

      const entry = await entryService.publish(id);
      return c.json({ entry });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to publish entry';
      return c.json({ error: message }, 400);
    }
  }
);

// Unpublish entry
entryRoutes.post(
  '/id/:id/unpublish',
  auth,
  requirePermission('entries:publish'),
  async (c) => {
    try {
      const id = c.req.param('id');

      const existing = await entryService.findById(id);
      if (!existing) {
        return c.json({ error: 'Entry not found' }, 404);
      }

      const entry = await entryService.unpublish(id);
      return c.json({ entry });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to unpublish entry';
      return c.json({ error: message }, 400);
    }
  }
);

// Archive entry
entryRoutes.post(
  '/id/:id/archive',
  auth,
  requirePermission('entries:write'),
  async (c) => {
    try {
      const id = c.req.param('id');

      const existing = await entryService.findById(id);
      if (!existing) {
        return c.json({ error: 'Entry not found' }, 404);
      }

      const entry = await entryService.archive(id);
      return c.json({ entry });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to archive entry';
      return c.json({ error: message }, 400);
    }
  }
);

// Assign terms to entry
entryRoutes.post(
  '/id/:id/terms',
  auth,
  requirePermission('entries:write'),
  zValidator('json', z.object({ termIds: z.array(z.string()) })),
  async (c) => {
    try {
      const id = c.req.param('id');
      const { termIds } = c.req.valid('json');

      const existing = await entryService.findById(id);
      if (!existing) {
        return c.json({ error: 'Entry not found' }, 404);
      }

      const entry = await entryService.assignTerms(id, termIds);
      return c.json({ entry });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to assign terms';
      return c.json({ error: message }, 400);
    }
  }
);

export { entryRoutes };
