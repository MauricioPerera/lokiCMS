/**
 * Taxonomy Factory
 * Generate test taxonomy data
 */

import { nanoid } from 'nanoid';
import type {
  Taxonomy,
  CreateTaxonomyInput,
  UpdateTaxonomyInput,
} from '../../../models/index.js';

let taxonomyCounter = 0;

/**
 * Generate unique slug for tests
 */
export function uniqueTaxonomySlug(): string {
  return `test-taxonomy-${nanoid(8)}`.toLowerCase();
}

/**
 * Create taxonomy input for creation
 */
export function createTaxonomyInput(
  overrides: Partial<CreateTaxonomyInput> = {}
): CreateTaxonomyInput {
  taxonomyCounter++;
  return {
    name: `Test Taxonomy ${taxonomyCounter}`,
    slug: uniqueTaxonomySlug(),
    description: 'A test taxonomy',
    hierarchical: false,
    allowMultiple: true,
    contentTypes: [],
    ...overrides,
  };
}

/**
 * Create a full taxonomy document (as stored in DB)
 */
export function createTaxonomy(overrides: Partial<Taxonomy> = {}): Taxonomy {
  const now = Date.now();
  taxonomyCounter++;

  return {
    id: nanoid(),
    name: `Test Taxonomy ${taxonomyCounter}`,
    slug: uniqueTaxonomySlug(),
    description: 'A test taxonomy',
    hierarchical: false,
    allowMultiple: true,
    contentTypes: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create category-like taxonomy (hierarchical)
 */
export function createCategoryTaxonomy(overrides: Partial<Taxonomy> = {}): Taxonomy {
  return createTaxonomy({
    name: `Category ${nanoid(4)}`,
    slug: `category-${nanoid(6)}`,
    description: 'Hierarchical categorization',
    hierarchical: true,
    allowMultiple: true,
    contentTypes: ['post'],
    ...overrides,
  });
}

/**
 * Create tag-like taxonomy (flat)
 */
export function createTagTaxonomy(overrides: Partial<Taxonomy> = {}): Taxonomy {
  return createTaxonomy({
    name: `Tag ${nanoid(4)}`,
    slug: `tag-${nanoid(6)}`,
    description: 'Flat tagging',
    hierarchical: false,
    allowMultiple: true,
    contentTypes: ['post', 'page'],
    ...overrides,
  });
}

/**
 * Create hierarchical taxonomy
 */
export function createHierarchicalTaxonomy(overrides: Partial<Taxonomy> = {}): Taxonomy {
  return createTaxonomy({
    hierarchical: true,
    ...overrides,
  });
}

/**
 * Create flat taxonomy
 */
export function createFlatTaxonomy(overrides: Partial<Taxonomy> = {}): Taxonomy {
  return createTaxonomy({
    hierarchical: false,
    ...overrides,
  });
}

/**
 * Create taxonomy for specific content types
 */
export function createTaxonomyForContentTypes(
  contentTypes: string[],
  overrides: Partial<Taxonomy> = {}
): Taxonomy {
  return createTaxonomy({
    contentTypes,
    ...overrides,
  });
}

/**
 * Create update taxonomy input
 */
export function createUpdateTaxonomyInput(
  overrides: Partial<UpdateTaxonomyInput> = {}
): UpdateTaxonomyInput {
  return {
    name: `Updated Taxonomy ${nanoid(4)}`,
    ...overrides,
  };
}

/**
 * Reset taxonomy counter (for test isolation)
 */
export function resetTaxonomyCounter(): void {
  taxonomyCounter = 0;
}
