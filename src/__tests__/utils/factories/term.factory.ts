/**
 * Term Factory
 * Generate test term data
 */

import { nanoid } from 'nanoid';
import type { Term, CreateTermInput, UpdateTermInput } from '../../../models/index.js';

let termCounter = 0;

/**
 * Generate unique slug for tests
 */
export function uniqueTermSlug(): string {
  return `test-term-${nanoid(8)}`.toLowerCase();
}

/**
 * Create term input for creation
 */
export function createTermInput(
  taxonomyId: string,
  overrides: Partial<CreateTermInput> = {}
): CreateTermInput {
  termCounter++;
  return {
    taxonomyId,
    name: `Test Term ${termCounter}`,
    description: 'A test term',
    order: 0,
    metadata: {},
    ...overrides,
  };
}

/**
 * Create term input with taxonomy slug
 */
export function createTermInputBySlug(
  taxonomySlug: string,
  overrides: Partial<CreateTermInput> = {}
): CreateTermInput {
  termCounter++;
  return {
    taxonomySlug,
    name: `Test Term ${termCounter}`,
    description: 'A test term',
    order: 0,
    metadata: {},
    ...overrides,
  };
}

/**
 * Create a full term document (as stored in DB)
 * Accepts either positional args (taxonomyId, taxonomySlug, overrides) or a single options object
 */
export function createTerm(
  taxonomyIdOrOptions?: string | Partial<Term>,
  taxonomySlug?: string,
  overrides: Partial<Term> = {}
): Term {
  const now = Date.now();
  termCounter++;

  // Support both calling patterns
  let finalOverrides: Partial<Term>;
  let finalTaxonomyId: string;
  let finalTaxonomySlug: string;

  if (typeof taxonomyIdOrOptions === 'object' && taxonomyIdOrOptions !== null) {
    // Called with options object: createTerm({ taxonomyId, taxonomySlug, ... })
    finalOverrides = taxonomyIdOrOptions;
    finalTaxonomyId = taxonomyIdOrOptions.taxonomyId ?? 'taxonomy-1';
    finalTaxonomySlug = taxonomyIdOrOptions.taxonomySlug ?? 'category';
  } else {
    // Called with positional args: createTerm(taxonomyId, taxonomySlug, overrides)
    finalTaxonomyId = taxonomyIdOrOptions ?? 'taxonomy-1';
    finalTaxonomySlug = taxonomySlug ?? 'category';
    finalOverrides = overrides;
  }

  return {
    id: nanoid(),
    taxonomyId: finalTaxonomyId,
    taxonomySlug: finalTaxonomySlug,
    name: `Test Term ${termCounter}`,
    slug: uniqueTermSlug(),
    description: 'A test term',
    order: 0,
    metadata: {},
    count: 0,
    createdAt: now,
    updatedAt: now,
    ...finalOverrides,
  };
}

/**
 * Create child term (with parent)
 */
export function createChildTerm(
  taxonomyId: string,
  taxonomySlug: string,
  parentId: string,
  overrides: Partial<Term> = {}
): Term {
  return createTerm(taxonomyId, taxonomySlug, {
    parentId,
    ...overrides,
  });
}

/**
 * Create term hierarchy
 * Returns [root, child, grandchild]
 */
export function createTermHierarchy(
  taxonomyId: string,
  taxonomySlug: string,
  depth: number = 3
): Term[] {
  const terms: Term[] = [];
  let parentId: string | undefined;

  for (let i = 0; i < depth; i++) {
    const term = createTerm(taxonomyId, taxonomySlug, {
      name: `Level ${i + 1} Term`,
      parentId,
      order: i,
    });
    terms.push(term);
    parentId = term.id;
  }

  return terms;
}

/**
 * Create sibling terms (same parent)
 */
export function createSiblingTerms(
  taxonomyId: string,
  taxonomySlug: string,
  count: number,
  parentId?: string
): Term[] {
  return Array.from({ length: count }, (_, i) =>
    createTerm(taxonomyId, taxonomySlug, {
      name: `Sibling Term ${i + 1}`,
      parentId,
      order: i,
    })
  );
}

/**
 * Create term with specific count
 */
export function createTermWithCount(
  taxonomyId: string,
  taxonomySlug: string,
  count: number,
  overrides: Partial<Term> = {}
): Term {
  return createTerm(taxonomyId, taxonomySlug, {
    count,
    ...overrides,
  });
}

/**
 * Create update term input
 */
export function createUpdateTermInput(overrides: Partial<UpdateTermInput> = {}): UpdateTermInput {
  return {
    name: `Updated Term ${nanoid(4)}`,
    ...overrides,
  };
}

/**
 * Create multiple terms
 */
export function createTerms(
  taxonomyId: string,
  taxonomySlug: string,
  count: number,
  overrides: Partial<Term> = {}
): Term[] {
  return Array.from({ length: count }, (_, i) =>
    createTerm(taxonomyId, taxonomySlug, {
      order: i,
      ...overrides,
    })
  );
}

/**
 * Reset term counter (for test isolation)
 */
export function resetTermCounter(): void {
  termCounter = 0;
}
