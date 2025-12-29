/**
 * MCP Taxonomy Tools
 * Tools for managing taxonomies and terms
 */

import { z } from 'zod';
import { taxonomyService, termService, entryService } from '../../services/index.js';
import type { CreateTaxonomyInput, CreateTermInput, UpdateTermInput } from '../../models/index.js';

// Tool definitions for taxonomy management
export const taxonomyTools = {
  // Taxonomy Tools
  list_taxonomies: {
    description: 'List all taxonomies in the CMS',
    inputSchema: z.object({
      contentType: z.string().optional().describe('Filter by content type slug'),
    }),
    handler: async (input: { contentType?: string }) => {
      if (input.contentType) {
        const taxonomies = await taxonomyService.findByContentType(input.contentType);
        return { taxonomies };
      }
      const taxonomies = await taxonomyService.findAll();
      return { taxonomies };
    },
  },

  get_taxonomy: {
    description: 'Get a taxonomy by its slug',
    inputSchema: z.object({
      slug: z.string().describe('The slug of the taxonomy'),
    }),
    handler: async ({ slug }: { slug: string }) => {
      const taxonomy = await taxonomyService.findBySlug(slug);
      if (!taxonomy) {
        return { error: 'Taxonomy not found' };
      }
      return { taxonomy };
    },
  },

  create_taxonomy: {
    description: 'Create a new taxonomy',
    inputSchema: z.object({
      name: z.string().describe('Display name of the taxonomy'),
      slug: z.string().describe('URL-friendly identifier'),
      description: z.string().optional().describe('Description of the taxonomy'),
      hierarchical: z.boolean().optional().describe('Whether terms can have parent-child relationships'),
      allowMultiple: z.boolean().optional().describe('Whether multiple terms can be assigned to an entry'),
      contentTypes: z.array(z.string()).optional().describe('Content type slugs that can use this taxonomy'),
    }),
    handler: async (input: CreateTaxonomyInput) => {
      try {
        const taxonomy = await taxonomyService.create(input);
        return { taxonomy, message: 'Taxonomy created successfully' };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to create taxonomy' };
      }
    },
  },

  delete_taxonomy: {
    description: 'Delete a taxonomy and all its terms',
    inputSchema: z.object({
      slug: z.string().describe('The slug of the taxonomy to delete'),
    }),
    handler: async ({ slug }: { slug: string }) => {
      try {
        const taxonomy = await taxonomyService.findBySlug(slug);
        if (!taxonomy) {
          return { error: 'Taxonomy not found' };
        }
        await taxonomyService.delete(taxonomy.id);
        return { message: 'Taxonomy deleted successfully' };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to delete taxonomy' };
      }
    },
  },

  // Term Tools
  list_terms: {
    description: 'List terms in a taxonomy',
    inputSchema: z.object({
      taxonomy: z.string().describe('Taxonomy slug'),
      tree: z.boolean().optional().describe('Return as hierarchical tree (for hierarchical taxonomies)'),
    }),
    handler: async (input: { taxonomy: string; tree?: boolean }) => {
      const taxonomy = await taxonomyService.findBySlug(input.taxonomy);
      if (!taxonomy) {
        return { error: 'Taxonomy not found' };
      }

      if (input.tree && taxonomy.hierarchical) {
        const terms = await termService.getTermTree(taxonomy.id);
        return { terms, taxonomy };
      }

      const terms = await termService.findByTaxonomySlug(input.taxonomy);
      return { terms, taxonomy };
    },
  },

  get_term: {
    description: 'Get a term by ID or by taxonomy and slug',
    inputSchema: z.object({
      id: z.string().optional().describe('Term ID'),
      taxonomy: z.string().optional().describe('Taxonomy slug'),
      slug: z.string().optional().describe('Term slug'),
    }),
    handler: async (input: { id?: string; taxonomy?: string; slug?: string }) => {
      let term = null;

      if (input.id) {
        term = await termService.findById(input.id);
      } else if (input.taxonomy && input.slug) {
        term = await termService.findBySlug(input.slug, input.taxonomy);
      } else {
        return { error: 'Provide either id, or both taxonomy and slug' };
      }

      if (!term) {
        return { error: 'Term not found' };
      }
      return { term };
    },
  },

  create_term: {
    description: 'Create a new term in a taxonomy',
    inputSchema: z.object({
      taxonomy: z.string().describe('Taxonomy slug'),
      name: z.string().describe('Term name'),
      slug: z.string().optional().describe('URL slug (auto-generated from name if not provided)'),
      description: z.string().optional().describe('Term description'),
      parentId: z.string().optional().describe('Parent term ID (for hierarchical taxonomies)'),
    }),
    handler: async (input: {
      taxonomy: string;
      name: string;
      slug?: string;
      description?: string;
      parentId?: string;
    }) => {
      try {
        const term = await termService.create({
          taxonomySlug: input.taxonomy,
          name: input.name,
          slug: input.slug,
          description: input.description,
          parentId: input.parentId,
          metadata: {},
          order: 0,
        });
        return { term, message: 'Term created successfully' };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to create term' };
      }
    },
  },

  update_term: {
    description: 'Update an existing term',
    inputSchema: z.object({
      id: z.string().describe('Term ID'),
      name: z.string().optional().describe('New name'),
      slug: z.string().optional().describe('New slug'),
      description: z.string().optional().describe('New description'),
      parentId: z.string().nullable().optional().describe('New parent ID (null to remove parent)'),
    }),
    handler: async (input: { id: string } & UpdateTermInput) => {
      try {
        const { id, ...updates } = input;
        const term = await termService.update(id, updates);
        return { term, message: 'Term updated successfully' };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to update term' };
      }
    },
  },

  delete_term: {
    description: 'Delete a term',
    inputSchema: z.object({
      id: z.string().describe('Term ID to delete'),
    }),
    handler: async ({ id }: { id: string }) => {
      try {
        await termService.delete(id);
        return { message: 'Term deleted successfully' };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to delete term' };
      }
    },
  },

  assign_terms: {
    description: 'Assign terms to an entry',
    inputSchema: z.object({
      entryId: z.string().describe('Entry ID'),
      termIds: z.array(z.string()).describe('Term IDs to assign'),
    }),
    handler: async ({ entryId, termIds }: { entryId: string; termIds: string[] }) => {
      try {
        const entry = await entryService.assignTerms(entryId, termIds);
        return { entry, message: 'Terms assigned successfully' };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to assign terms' };
      }
    },
  },

  get_entries_by_term: {
    description: 'Get all entries that have a specific term',
    inputSchema: z.object({
      termId: z.string().describe('Term ID'),
      limit: z.number().optional().describe('Maximum entries to return'),
    }),
    handler: async ({ termId, limit }: { termId: string; limit?: number }) => {
      const result = await entryService.findByTerm(termId, { page: 1, limit: limit ?? 50 });
      return result;
    },
  },
};
