/**
 * Vector Search Routes
 * Semantic search API using Ollama embeddings
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { vectorSearchService } from '../../services/vector-search.service.js';
import { auth, optionalAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/roles.js';

const vectorSearchRoutes = new Hono();

// Validation schemas
const SearchSchema = z.object({
  query: z.string().min(1).max(1000),
  limit: z.number().min(1).max(100).optional(),
  contentType: z.string().optional(),
  minSimilarity: z.number().min(0).max(1).optional(),
  hybrid: z.boolean().optional(),
  keywordWeight: z.number().min(0).max(1).optional(),
});

const IndexSchema = z.object({
  entryId: z.string().min(1),
});

const IndexAllSchema = z.object({
  contentType: z.string().optional(),
});

// ============================================================================
// Search Routes
// ============================================================================

/**
 * Semantic search
 * POST /api/search/semantic
 */
vectorSearchRoutes.post(
  '/semantic',
  optionalAuth,
  zValidator('json', SearchSchema),
  async (c) => {
    try {
      const input = c.req.valid('json');
      const startTime = performance.now();

      let results;
      if (input.hybrid) {
        results = await vectorSearchService.hybridSearch(input.query, {
          limit: input.limit,
          contentType: input.contentType,
          keywordWeight: input.keywordWeight,
        });
      } else {
        results = await vectorSearchService.search(input.query, {
          limit: input.limit,
          contentType: input.contentType,
          minSimilarity: input.minSimilarity,
        });
      }

      const took = Math.round(performance.now() - startTime);

      // Filter out non-published for unauthenticated users
      const session = c.get('session');
      const filteredResults = session
        ? results
        : results.filter(r => r.entry.status === 'published');

      return c.json({
        results: filteredResults.map(r => ({
          id: r.entry.id,
          title: r.entry.title,
          slug: r.entry.slug,
          contentType: r.entry.contentTypeSlug,
          status: r.entry.status,
          similarity: r.similarity,
          excerpt: r.entry.content?.body?.slice(0, 200) || r.entry.content?.description?.slice(0, 200),
        })),
        total: filteredResults.length,
        query: input.query,
        took,
        mode: input.hybrid ? 'hybrid' : 'semantic',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed';
      return c.json({ error: message }, 500);
    }
  }
);

// ============================================================================
// Index Management Routes
// ============================================================================

/**
 * Index a single entry
 * POST /api/search/index
 */
vectorSearchRoutes.post(
  '/index',
  auth,
  requirePermission('content:update'),
  zValidator('json', IndexSchema),
  async (c) => {
    try {
      const { entryId } = c.req.valid('json');
      const startTime = performance.now();

      const success = await vectorSearchService.indexEntry(entryId);
      const took = Math.round(performance.now() - startTime);

      if (success) {
        return c.json({
          message: 'Entry indexed successfully',
          entryId,
          took,
        });
      } else {
        return c.json({ error: 'Failed to index entry. Ollama may not be available.' }, 500);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Indexing failed';
      return c.json({ error: message }, 500);
    }
  }
);

/**
 * Index all entries
 * POST /api/search/index-all
 */
vectorSearchRoutes.post(
  '/index-all',
  auth,
  requirePermission('system:admin'),
  zValidator('json', IndexAllSchema),
  async (c) => {
    try {
      const { contentType } = c.req.valid('json');
      const startTime = performance.now();

      const result = await vectorSearchService.indexAll({
        contentType,
      });

      const took = Math.round(performance.now() - startTime);

      return c.json({
        message: 'Indexing complete',
        ...result,
        took,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Indexing failed';
      return c.json({ error: message }, 500);
    }
  }
);

/**
 * Remove entry from index
 * DELETE /api/search/index/:entryId
 */
vectorSearchRoutes.delete(
  '/index/:entryId',
  auth,
  requirePermission('content:delete'),
  async (c) => {
    try {
      const entryId = c.req.param('entryId');
      const success = await vectorSearchService.removeEntry(entryId);

      if (success) {
        return c.json({ message: 'Entry removed from index', entryId });
      } else {
        return c.json({ error: 'Entry not found in index' }, 404);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove entry';
      return c.json({ error: message }, 500);
    }
  }
);

// ============================================================================
// Status Routes
// ============================================================================

/**
 * Get vector search stats
 * GET /api/search/vector-stats
 */
vectorSearchRoutes.get('/vector-stats', auth, async (c) => {
  try {
    const stats = await vectorSearchService.getStats();
    return c.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get stats';
    return c.json({ error: message }, 500);
  }
});

/**
 * Check if vector search is available
 * GET /api/search/vector-status
 */
vectorSearchRoutes.get('/vector-status', async (c) => {
  try {
    const isReady = await vectorSearchService.isReady();
    const stats = await vectorSearchService.getStats();

    return c.json({
      available: isReady,
      model: stats.model,
      dimensions: stats.dimensions,
      indexed: stats.totalIndexed,
    });
  } catch (error) {
    return c.json({
      available: false,
      error: 'Failed to check status',
    });
  }
});

export { vectorSearchRoutes };
