/**
 * Search Routes
 * Full-text search across all content
 */

import { Hono } from 'hono';
import { searchService } from '../../services/search.service.js';
import { optionalAuth } from '../middleware/auth.js';

const searchRoutes = new Hono();

/**
 * Global search
 * GET /api/search?q=query&types=entry,content-type&contentTypes=post,page&status=published
 */
searchRoutes.get('/', optionalAuth, async (c) => {
  try {
    const query = c.req.query();
    const session = c.get('session');

    const searchQuery = query['q'] || query['query'];
    if (!searchQuery) {
      return c.json({ error: 'Query parameter "q" is required' }, 400);
    }

    // Parse types
    const typesParam = query['types'];
    const types = typesParam
      ? (typesParam.split(',') as ('entry' | 'content-type' | 'user')[])
      : undefined;

    // Parse content types filter
    const contentTypesParam = query['contentTypes'] || query['content_types'];
    const contentTypes = contentTypesParam ? contentTypesParam.split(',') : undefined;

    // Non-authenticated users can only search published entries
    let status = query['status'];
    if (!session) {
      status = 'published';
    }

    const limit = query['limit'] ? parseInt(query['limit']) : 20;
    const offset = query['offset'] ? parseInt(query['offset']) : 0;
    const locale = query['locale'];

    const result = await searchService.search({
      query: searchQuery,
      types,
      contentTypes,
      status,
      limit: Math.min(limit, 100), // Max 100 results
      offset,
      locale,
    });

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search failed';
    return c.json({ error: message }, 400);
  }
});

/**
 * Get search suggestions
 * GET /api/search/suggest?q=partial
 * Note: Must be defined before /:contentType to avoid conflict
 */
searchRoutes.get('/suggest', async (c) => {
  try {
    const query = c.req.query();
    const searchQuery = query['q'] || query['query'];

    if (!searchQuery) {
      return c.json({ suggestions: [] });
    }

    const limit = query['limit'] ? parseInt(query['limit']) : 5;
    const suggestions = await searchService.suggest(searchQuery, Math.min(limit, 10));

    return c.json({ suggestions });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Suggest failed';
    return c.json({ error: message }, 400);
  }
});

/**
 * Search within a specific content type
 * GET /api/search/:contentType?q=query
 */
searchRoutes.get('/:contentType', optionalAuth, async (c) => {
  try {
    const contentType = c.req.param('contentType');
    const query = c.req.query();
    const session = c.get('session');

    const searchQuery = query['q'] || query['query'];
    if (!searchQuery) {
      return c.json({ error: 'Query parameter "q" is required' }, 400);
    }

    // Non-authenticated users can only search published entries
    let status = query['status'];
    if (!session) {
      status = 'published';
    }

    const limit = query['limit'] ? parseInt(query['limit']) : 20;
    const offset = query['offset'] ? parseInt(query['offset']) : 0;

    const result = await searchService.searchInContentType(contentType, searchQuery, {
      status,
      limit: Math.min(limit, 100),
      offset,
    });

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search failed';
    return c.json({ error: message }, 400);
  }
});

export { searchRoutes };
