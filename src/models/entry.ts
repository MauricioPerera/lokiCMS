/**
 * Entry Model
 * Represents content entries (instances of content types)
 */

import { z } from 'zod';

// Entry status
export const EntryStatusSchema = z.enum(['draft', 'published', 'archived', 'scheduled']);
export type EntryStatus = z.infer<typeof EntryStatusSchema>;

// Entry schema
export const EntrySchema = z.object({
  id: z.string(),
  contentTypeId: z.string(),
  contentTypeSlug: z.string(),
  title: z.string().min(1).max(256),
  slug: z.string().min(1).max(256).regex(/^[a-z0-9][a-z0-9-]*$/),
  content: z.record(z.unknown()).default({}),
  metadata: z.record(z.unknown()).default({}),
  status: EntryStatusSchema.default('draft'),
  authorId: z.string(),
  authorName: z.string().optional(),
  taxonomyTerms: z.array(z.string()).default([]),
  version: z.number().default(1),
  locale: z.string().default('en'),
  createdAt: z.number(),
  updatedAt: z.number(),
  publishedAt: z.number().optional(),
  scheduledAt: z.number().optional(),
});

export type Entry = z.infer<typeof EntrySchema>;

// Create entry input
export const CreateEntrySchema = z.object({
  contentTypeId: z.string().optional(),
  contentTypeSlug: z.string().optional(),
  title: z.string().min(1).max(256),
  slug: z.string().min(1).max(256).regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
  content: z.record(z.unknown()).default({}),
  metadata: z.record(z.unknown()).default({}),
  status: EntryStatusSchema.default('draft'),
  taxonomyTerms: z.array(z.string()).default([]),
  locale: z.string().default('en'),
  scheduledAt: z.number().optional(),
}).refine(
  data => data.contentTypeId || data.contentTypeSlug,
  { message: 'Either contentTypeId or contentTypeSlug is required' }
);

export type CreateEntryInput = z.infer<typeof CreateEntrySchema>;

// Update entry input
export const UpdateEntrySchema = z.object({
  title: z.string().min(1).max(256).optional(),
  slug: z.string().min(1).max(256).regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
  content: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
  status: EntryStatusSchema.optional(),
  taxonomyTerms: z.array(z.string()).optional(),
  locale: z.string().optional(),
  scheduledAt: z.number().optional(),
});

export type UpdateEntryInput = z.infer<typeof UpdateEntrySchema>;

// Entry filters for querying
export const EntryFiltersSchema = z.object({
  contentTypeId: z.string().optional(),
  contentTypeSlug: z.string().optional(),
  status: EntryStatusSchema.optional(),
  authorId: z.string().optional(),
  taxonomyTerms: z.array(z.string()).optional(),
  locale: z.string().optional(),
  search: z.string().optional(),
  createdAfter: z.number().optional(),
  createdBefore: z.number().optional(),
  publishedAfter: z.number().optional(),
  publishedBefore: z.number().optional(),
});

export type EntryFilters = z.infer<typeof EntryFiltersSchema>;

// Entry sort options
export const EntrySortSchema = z.object({
  field: z.enum(['title', 'createdAt', 'updatedAt', 'publishedAt', 'slug']),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type EntrySort = z.infer<typeof EntrySortSchema>;

// Entry pagination
export const EntryPaginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
});

export type EntryPagination = z.infer<typeof EntryPaginationSchema>;

// Paginated entries response
export interface PaginatedEntries {
  entries: Entry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Generate slug from title
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 256);
}

// Entry version for versioning support
export interface EntryVersion {
  id: string;
  entryId: string;
  version: number;
  content: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: number;
  createdBy: string;
  changeNote?: string;
}
