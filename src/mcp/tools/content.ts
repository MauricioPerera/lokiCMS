/**
 * MCP Content Tools
 * Tools for managing content types and entries
 */

import { z } from 'zod';
import { contentTypeService, entryService } from '../../services/index.js';
import type { CreateContentTypeInput, CreateEntryInput, UpdateEntryInput } from '../../models/index.js';

// Tool definitions for content management
export const contentTools = {
  // Content Type Tools
  list_content_types: {
    description: 'List all content types in the CMS',
    inputSchema: z.object({}),
    handler: async () => {
      const contentTypes = await contentTypeService.findAll();
      return { contentTypes };
    },
  },

  get_content_type: {
    description: 'Get a content type by its slug',
    inputSchema: z.object({
      slug: z.string().describe('The slug of the content type'),
    }),
    handler: async ({ slug }: { slug: string }) => {
      const contentType = await contentTypeService.findBySlug(slug);
      if (!contentType) {
        return { error: 'Content type not found' };
      }
      const count = await contentTypeService.getEntriesCount(contentType.id);
      return { contentType, entriesCount: count };
    },
  },

  create_content_type: {
    description: 'Create a new content type with custom fields',
    inputSchema: z.object({
      name: z.string().describe('Display name of the content type'),
      slug: z.string().describe('URL-friendly identifier'),
      description: z.string().optional().describe('Description of the content type'),
      fields: z.array(z.object({
        name: z.string().describe('Field name (alphanumeric, starts with letter)'),
        label: z.string().describe('Display label'),
        type: z.enum(['text', 'textarea', 'richtext', 'number', 'boolean', 'date', 'datetime', 'email', 'url', 'slug', 'select', 'multiselect', 'relation', 'media', 'json']),
        required: z.boolean().optional(),
        description: z.string().optional(),
      })).optional().describe('Custom fields for this content type'),
    }),
    handler: async (input: CreateContentTypeInput) => {
      try {
        const contentType = await contentTypeService.create(input);
        return { contentType, message: 'Content type created successfully' };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to create content type' };
      }
    },
  },

  delete_content_type: {
    description: 'Delete a content type (only if no entries exist)',
    inputSchema: z.object({
      slug: z.string().describe('The slug of the content type to delete'),
    }),
    handler: async ({ slug }: { slug: string }) => {
      try {
        const contentType = await contentTypeService.findBySlug(slug);
        if (!contentType) {
          return { error: 'Content type not found' };
        }
        await contentTypeService.delete(contentType.id);
        return { message: 'Content type deleted successfully' };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to delete content type' };
      }
    },
  },

  // Entry Tools
  list_entries: {
    description: 'List entries with optional filters',
    inputSchema: z.object({
      contentType: z.string().optional().describe('Filter by content type slug'),
      status: z.enum(['draft', 'published', 'archived']).optional().describe('Filter by status'),
      search: z.string().optional().describe('Search in title and slug'),
      limit: z.number().optional().describe('Maximum entries to return (default 20)'),
      page: z.number().optional().describe('Page number (default 1)'),
    }),
    handler: async (input: {
      contentType?: string;
      status?: 'draft' | 'published' | 'archived';
      search?: string;
      limit?: number;
      page?: number;
    }) => {
      const result = await entryService.findAll(
        {
          contentTypeSlug: input.contentType,
          status: input.status,
          search: input.search,
        },
        { field: 'createdAt', order: 'desc' },
        { page: input.page ?? 1, limit: input.limit ?? 20 }
      );
      return result;
    },
  },

  get_entry: {
    description: 'Get an entry by ID or by content type and slug',
    inputSchema: z.object({
      id: z.string().optional().describe('Entry ID'),
      contentType: z.string().optional().describe('Content type slug'),
      slug: z.string().optional().describe('Entry slug'),
    }),
    handler: async (input: { id?: string; contentType?: string; slug?: string }) => {
      let entry = null;

      if (input.id) {
        entry = await entryService.findById(input.id);
      } else if (input.contentType && input.slug) {
        entry = await entryService.findBySlug(input.slug, input.contentType);
      } else {
        return { error: 'Provide either id, or both contentType and slug' };
      }

      if (!entry) {
        return { error: 'Entry not found' };
      }
      return { entry };
    },
  },

  create_entry: {
    description: 'Create a new content entry',
    inputSchema: z.object({
      contentType: z.string().describe('Content type slug'),
      title: z.string().describe('Entry title'),
      slug: z.string().optional().describe('URL slug (auto-generated from title if not provided)'),
      content: z.record(z.unknown()).describe('Field values matching the content type schema'),
      status: z.enum(['draft', 'published']).optional().describe('Entry status'),
      taxonomyTerms: z.array(z.string()).optional().describe('Term IDs to assign'),
    }),
    handler: async (input: {
      contentType: string;
      title: string;
      slug?: string;
      content: Record<string, unknown>;
      status?: 'draft' | 'published';
      taxonomyTerms?: string[];
    }) => {
      try {
        // Use a system author for MCP-created entries
        const entry = await entryService.create(
          {
            contentTypeSlug: input.contentType,
            title: input.title,
            slug: input.slug,
            content: input.content,
            metadata: {},
            status: input.status ?? 'draft',
            taxonomyTerms: input.taxonomyTerms ?? [],
            locale: 'en',
          },
          'system',
          'MCP System'
        );
        return { entry, message: 'Entry created successfully' };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to create entry' };
      }
    },
  },

  update_entry: {
    description: 'Update an existing entry',
    inputSchema: z.object({
      id: z.string().describe('Entry ID'),
      title: z.string().optional().describe('New title'),
      slug: z.string().optional().describe('New slug'),
      content: z.record(z.unknown()).optional().describe('Updated field values'),
      status: z.enum(['draft', 'published', 'archived']).optional().describe('New status'),
      taxonomyTerms: z.array(z.string()).optional().describe('Term IDs to assign'),
    }),
    handler: async (input: { id: string } & UpdateEntryInput) => {
      try {
        const { id, ...updates } = input;
        const entry = await entryService.update(id, updates);
        return { entry, message: 'Entry updated successfully' };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to update entry' };
      }
    },
  },

  delete_entry: {
    description: 'Delete an entry',
    inputSchema: z.object({
      id: z.string().describe('Entry ID to delete'),
    }),
    handler: async ({ id }: { id: string }) => {
      try {
        await entryService.delete(id);
        return { message: 'Entry deleted successfully' };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to delete entry' };
      }
    },
  },

  publish_entry: {
    description: 'Publish an entry (change status to published)',
    inputSchema: z.object({
      id: z.string().describe('Entry ID to publish'),
    }),
    handler: async ({ id }: { id: string }) => {
      try {
        const entry = await entryService.publish(id);
        return { entry, message: 'Entry published successfully' };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to publish entry' };
      }
    },
  },

  unpublish_entry: {
    description: 'Unpublish an entry (change status to draft)',
    inputSchema: z.object({
      id: z.string().describe('Entry ID to unpublish'),
    }),
    handler: async ({ id }: { id: string }) => {
      try {
        const entry = await entryService.unpublish(id);
        return { entry, message: 'Entry unpublished successfully' };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to unpublish entry' };
      }
    },
  },
};
