/**
 * GraphQL Routes
 * Simple GraphQL-like query API without heavy dependencies
 * Follows LokiCMS lightweight philosophy
 */

import { Hono } from 'hono';
import { getContentTypesCollection, getEntriesCollection, getTaxonomiesCollection, getTermsCollection } from '../../db/index.js';
import { searchService } from '../../services/search.service.js';
import { relationshipService } from '../../services/relationship.service.js';
import { optionalAuth } from '../middleware/auth.js';

const graphqlRoutes = new Hono();

// Query types
interface GraphQLQuery {
  query: string;
  variables?: Record<string, unknown>;
}

interface QueryContext {
  isAuthenticated: boolean;
  userId?: string;
}

// Field selection parser
function parseFields(fieldStr: string): string[] {
  return fieldStr
    .replace(/[{}]/g, '')
    .split(/[\s,]+/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

// Simple query parser
function parseQuery(query: string): {
  operation: string;
  args: Record<string, unknown>;
  fields: string[];
} | null {
  // Match pattern: operation(args) { fields }
  const match = query.match(/(\w+)\s*(\([^)]*\))?\s*\{([^}]+)\}/);
  if (!match) return null;

  const operation = match[1];
  const argsStr = match[2] || '';
  const fieldsStr = match[3];

  // Parse arguments
  const args: Record<string, unknown> = {};
  const argMatches = argsStr.matchAll(/(\w+)\s*:\s*("[^"]*"|\d+|true|false|\$\w+)/g);
  for (const m of argMatches) {
    let value: string | boolean | number = m[2];
    if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    } else if (value === 'true') {
      value = true;
    } else if (value === 'false') {
      value = false;
    } else if (typeof value === 'string' && !value.startsWith('$') && !isNaN(Number(value))) {
      value = Number(value);
    }
    args[m[1]] = value;
  }

  const fields = parseFields(fieldsStr);

  return { operation, args, fields };
}

// Select fields from object
function selectFields(obj: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  if (fields.length === 0) return obj;

  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in obj) {
      result[field] = obj[field];
    }
  }
  return result;
}

// Query handlers
const queryHandlers: Record<
  string,
  (args: Record<string, unknown>, fields: string[], ctx: QueryContext) => Promise<unknown>
> = {
  // Content Types
  async contentTypes(args, fields) {
    const collection = getContentTypesCollection();
    if (!collection) return [];

    const items = collection.find();
    return items.map((item) => selectFields(item as unknown as Record<string, unknown>, fields));
  },

  async contentType(args, fields) {
    const collection = getContentTypesCollection();
    if (!collection) return null;

    const slug = args['slug'] as string;
    const item = collection.findOne({ slug });
    return item ? selectFields(item as unknown as Record<string, unknown>, fields) : null;
  },

  // Entries
  async entries(args, fields, ctx) {
    const collection = getEntriesCollection();
    if (!collection) return { items: [], total: 0 };

    let chain = collection.chain();

    // Filter by content type
    if (args['contentType']) {
      chain = chain.find({ contentTypeSlug: args['contentType'] });
    }

    // Filter by status (non-authenticated only see published)
    if (!ctx.isAuthenticated) {
      chain = chain.find({ status: 'published' });
    } else if (args['status']) {
      chain = chain.find({ status: args['status'] });
    }

    // Filter by locale
    if (args['locale']) {
      chain = chain.find({ locale: args['locale'] });
    }

    const total = chain.count();

    // Pagination
    const limit = (args['limit'] as number) || 20;
    const offset = (args['offset'] as number) || 0;

    const items = chain
      .simplesort('createdAt', true)
      .offset(offset)
      .limit(limit)
      .data()
      .map((item) => selectFields(item as unknown as Record<string, unknown>, fields));

    return { items, total };
  },

  async entry(args, fields, ctx) {
    const collection = getEntriesCollection();
    if (!collection) return null;

    let item = null;
    if (args['id']) {
      item = collection.findOne({ id: args['id'] });
    } else if (args['slug']) {
      item = collection.findOne({ slug: args['slug'] });
    }

    if (!item) return null;

    // Check access
    if (!ctx.isAuthenticated && item.status !== 'published') {
      return null;
    }

    const result = selectFields(item as Record<string, unknown>, fields);

    // Include relationships if requested
    if (fields.includes('relationships') || fields.includes('related')) {
      const related = await relationshipService.getRelated(item.id);
      (result as any).relationships = related.map((r) => ({
        name: r.definition.slug,
        entries: r.entries.map((e) => ({
          id: e.id,
          title: e.title,
          slug: e.slug,
        })),
      }));
    }

    return result;
  },

  // Taxonomies
  async taxonomies(args, fields) {
    const collection = getTaxonomiesCollection();
    if (!collection) return [];

    const items = collection.find();
    return items.map((item) => selectFields(item as unknown as Record<string, unknown>, fields));
  },

  async taxonomy(args, fields) {
    const collection = getTaxonomiesCollection();
    if (!collection) return null;

    const slug = args['slug'] as string;
    const item = collection.findOne({ slug });

    if (!item) return null;

    const result = selectFields(item as unknown as Record<string, unknown>, fields);

    // Include terms if requested
    if (fields.includes('terms')) {
      const termsCollection = getTermsCollection();
      if (termsCollection) {
        const terms = termsCollection.find({ taxonomySlug: slug });
        (result as any).terms = terms.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
        }));
      }
    }

    return result;
  },

  // Terms
  async terms(args, fields) {
    const collection = getTermsCollection();
    if (!collection) return [];

    let chain = collection.chain();

    if (args['taxonomy']) {
      chain = chain.find({ taxonomySlug: args['taxonomy'] });
    }

    const items = chain.data();
    return items.map((item) => selectFields(item as unknown as Record<string, unknown>, fields));
  },

  // Search
  async search(args, fields, ctx) {
    const query = args['query'] as string;
    if (!query) return { results: [], total: 0 };

    const results = await searchService.search({
      query,
      types: args['types'] as any,
      contentTypes: args['contentTypes'] as string[],
      status: ctx.isAuthenticated ? (args['status'] as string) : 'published',
      limit: (args['limit'] as number) || 20,
    });

    return {
      results: results.results.map((r) => selectFields(r as unknown as Record<string, unknown>, fields)),
      total: results.total,
    };
  },
};

/**
 * GraphQL endpoint
 * POST /api/graphql
 */
graphqlRoutes.post('/', optionalAuth, async (c) => {
  try {
    const body = await c.req.json() as GraphQLQuery;
    const { query, variables } = body;

    if (!query) {
      return c.json({ errors: [{ message: 'Query is required' }] }, 400);
    }

    // Replace variables in query
    let processedQuery = query;
    if (variables) {
      for (const [key, value] of Object.entries(variables)) {
        const placeholder = `$${key}`;
        const replacement = typeof value === 'string' ? `"${value}"` : String(value);
        processedQuery = processedQuery.replace(new RegExp(`\\$${key}`, 'g'), replacement);
      }
    }

    // Parse query
    const parsed = parseQuery(processedQuery);
    if (!parsed) {
      return c.json({ errors: [{ message: 'Invalid query syntax' }] }, 400);
    }

    const { operation, args, fields } = parsed;

    // Get handler
    const handler = queryHandlers[operation];
    if (!handler) {
      return c.json({ errors: [{ message: `Unknown operation: ${operation}` }] }, 400);
    }

    // Build context
    const session = c.get('session');
    const ctx: QueryContext = {
      isAuthenticated: !!session,
      userId: session?.user?.id,
    };

    // Execute query
    const data = await handler(args, fields, ctx);

    return c.json({ data: { [operation]: data } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Query failed';
    return c.json({ errors: [{ message }] }, 500);
  }
});

/**
 * GraphQL introspection (simplified schema)
 * GET /api/graphql/schema
 */
graphqlRoutes.get('/schema', (c) => {
  return c.json({
    queries: {
      contentTypes: {
        description: 'Get all content types',
        fields: ['id', 'name', 'slug', 'description', 'fields'],
      },
      contentType: {
        description: 'Get a content type by slug',
        args: { slug: 'String!' },
        fields: ['id', 'name', 'slug', 'description', 'fields'],
      },
      entries: {
        description: 'Get entries with filtering',
        args: {
          contentType: 'String',
          status: 'String',
          locale: 'String',
          limit: 'Int',
          offset: 'Int',
        },
        returns: '{ items, total }',
      },
      entry: {
        description: 'Get an entry by id or slug',
        args: { id: 'String', slug: 'String' },
        fields: ['id', 'title', 'slug', 'content', 'status', 'relationships'],
      },
      taxonomies: {
        description: 'Get all taxonomies',
        fields: ['id', 'name', 'slug', 'terms'],
      },
      taxonomy: {
        description: 'Get a taxonomy by slug',
        args: { slug: 'String!' },
        fields: ['id', 'name', 'slug', 'terms'],
      },
      terms: {
        description: 'Get terms',
        args: { taxonomy: 'String' },
        fields: ['id', 'name', 'slug', 'taxonomySlug'],
      },
      search: {
        description: 'Search across content',
        args: { query: 'String!', types: '[String]', limit: 'Int' },
        returns: '{ results, total }',
      },
    },
    examples: [
      {
        name: 'Get all posts',
        query: 'entries(contentType: "post", limit: 10) { id title slug status }',
      },
      {
        name: 'Get entry with relationships',
        query: 'entry(slug: "my-post") { id title content relationships }',
      },
      {
        name: 'Search content',
        query: 'search(query: "hello") { id title type score }',
      },
    ],
  });
});

export { graphqlRoutes };
