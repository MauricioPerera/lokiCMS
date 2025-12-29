/**
 * Taxonomy Model
 * Represents taxonomy types (like categories, tags)
 */

import { z } from 'zod';

// Taxonomy schema
export const TaxonomySchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(64),
  slug: z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/),
  description: z.string().max(512).optional(),
  hierarchical: z.boolean().default(false),
  allowMultiple: z.boolean().default(true),
  contentTypes: z.array(z.string()).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type Taxonomy = z.infer<typeof TaxonomySchema>;

// Create taxonomy input
export const CreateTaxonomySchema = TaxonomySchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateTaxonomyInput = z.infer<typeof CreateTaxonomySchema>;

// Update taxonomy input
export const UpdateTaxonomySchema = CreateTaxonomySchema.partial();

export type UpdateTaxonomyInput = z.infer<typeof UpdateTaxonomySchema>;

// Default taxonomies
export const DEFAULT_TAXONOMIES: CreateTaxonomyInput[] = [
  {
    name: 'Category',
    slug: 'category',
    description: 'Hierarchical content categorization',
    hierarchical: true,
    allowMultiple: true,
    contentTypes: ['post'],
  },
  {
    name: 'Tag',
    slug: 'tag',
    description: 'Flat content tagging',
    hierarchical: false,
    allowMultiple: true,
    contentTypes: ['post', 'page'],
  },
];
