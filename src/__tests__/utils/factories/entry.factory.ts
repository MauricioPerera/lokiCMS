/**
 * Entry Factory
 * Generate test entry data
 */

import { nanoid } from 'nanoid';
import type { Entry, CreateEntryInput, UpdateEntryInput, EntryStatus } from '../../../models/index.js';

let entryCounter = 0;

/**
 * Generate unique slug for tests
 */
export function uniqueSlug(prefix: string = 'test-entry'): string {
  return `${prefix}-${nanoid(8)}`.toLowerCase();
}

/**
 * Create entry input for creation
 */
export function createEntryInput(
  contentTypeId: string,
  overrides: Partial<CreateEntryInput> = {}
): CreateEntryInput {
  entryCounter++;
  return {
    contentTypeId,
    title: `Test Entry ${entryCounter}`,
    content: { body: 'Test content body' },
    status: 'draft',
    taxonomyTerms: [],
    locale: 'en',
    ...overrides,
  };
}

/**
 * Create entry input with slug
 */
export function createEntryInputWithSlug(
  contentTypeSlug: string,
  overrides: Partial<CreateEntryInput> = {}
): CreateEntryInput {
  entryCounter++;
  return {
    contentTypeSlug,
    title: `Test Entry ${entryCounter}`,
    content: { body: 'Test content body' },
    status: 'draft',
    taxonomyTerms: [],
    locale: 'en',
    ...overrides,
  };
}

/**
 * Create a full entry document (as stored in DB)
 * Accepts either positional args (contentTypeId, authorId, overrides) or a single options object
 */
export function createEntry(
  contentTypeIdOrOptions?: string | Partial<Entry>,
  authorId?: string,
  overrides: Partial<Entry> = {}
): Entry {
  const now = Date.now();
  entryCounter++;
  const slug = uniqueSlug();

  // Support both calling patterns
  let finalOverrides: Partial<Entry>;
  let finalContentTypeId: string;
  let finalAuthorId: string;

  if (typeof contentTypeIdOrOptions === 'object' && contentTypeIdOrOptions !== null) {
    // Called with options object: createEntry({ contentTypeId, ... })
    finalOverrides = contentTypeIdOrOptions;
    finalContentTypeId = contentTypeIdOrOptions.contentTypeId ?? 'content-type-1';
    finalAuthorId = contentTypeIdOrOptions.authorId ?? 'author-1';
  } else {
    // Called with positional args: createEntry(contentTypeId, authorId, overrides)
    finalContentTypeId = contentTypeIdOrOptions ?? 'content-type-1';
    finalAuthorId = authorId ?? 'author-1';
    finalOverrides = overrides;
  }

  return {
    id: nanoid(),
    contentTypeId: finalContentTypeId,
    contentTypeSlug: 'post',
    title: `Test Entry ${entryCounter}`,
    slug,
    content: { body: 'Test content body' },
    metadata: {},
    status: 'draft',
    authorId: finalAuthorId,
    taxonomyTerms: [],
    version: 1,
    locale: 'en',
    createdAt: now,
    updatedAt: now,
    ...finalOverrides,
  };
}

/**
 * Create published entry
 */
export function createPublishedEntry(
  contentTypeIdOrOptions?: string | Partial<Entry>,
  authorId?: string,
  overrides: Partial<Entry> = {}
): Entry {
  const now = Date.now();
  if (typeof contentTypeIdOrOptions === 'object' && contentTypeIdOrOptions !== null) {
    return createEntry({
      status: 'published',
      publishedAt: now,
      ...contentTypeIdOrOptions,
    });
  }
  return createEntry(contentTypeIdOrOptions, authorId, {
    status: 'published',
    publishedAt: now,
    ...overrides,
  });
}

/**
 * Create draft entry
 */
export function createDraftEntry(
  contentTypeIdOrOptions?: string | Partial<Entry>,
  authorId?: string,
  overrides: Partial<Entry> = {}
): Entry {
  if (typeof contentTypeIdOrOptions === 'object' && contentTypeIdOrOptions !== null) {
    return createEntry({
      status: 'draft',
      ...contentTypeIdOrOptions,
    });
  }
  return createEntry(contentTypeIdOrOptions, authorId, {
    status: 'draft',
    ...overrides,
  });
}

/**
 * Create archived entry
 */
export function createArchivedEntry(
  contentTypeIdOrOptions?: string | Partial<Entry>,
  authorId?: string,
  overrides: Partial<Entry> = {}
): Entry {
  if (typeof contentTypeIdOrOptions === 'object' && contentTypeIdOrOptions !== null) {
    return createEntry({
      status: 'archived',
      ...contentTypeIdOrOptions,
    });
  }
  return createEntry(contentTypeIdOrOptions, authorId, {
    status: 'archived',
    ...overrides,
  });
}

/**
 * Create scheduled entry
 */
export function createScheduledEntry(
  contentTypeId: string,
  authorId: string,
  scheduledAt: number,
  overrides: Partial<Entry> = {}
): Entry {
  return createEntry(contentTypeId, authorId, {
    status: 'scheduled',
    scheduledAt,
    ...overrides,
  });
}

/**
 * Create entry with specific status
 */
export function createEntryWithStatus(
  contentTypeId: string,
  authorId: string,
  status: EntryStatus,
  overrides: Partial<Entry> = {}
): Entry {
  const entry = createEntry(contentTypeId, authorId, { status, ...overrides });
  if (status === 'published' && !entry.publishedAt) {
    entry.publishedAt = Date.now();
  }
  return entry;
}

/**
 * Create entry with taxonomy terms
 */
export function createEntryWithTerms(
  contentTypeId: string,
  authorId: string,
  termIds: string[],
  overrides: Partial<Entry> = {}
): Entry {
  return createEntry(contentTypeId, authorId, {
    taxonomyTerms: termIds,
    ...overrides,
  });
}

/**
 * Create update entry input
 */
export function createUpdateEntryInput(overrides: Partial<UpdateEntryInput> = {}): UpdateEntryInput {
  return {
    title: `Updated Entry ${nanoid(4)}`,
    ...overrides,
  };
}

/**
 * Create multiple entries
 */
export function createEntries(
  contentTypeId: string,
  authorId: string,
  count: number,
  overrides: Partial<Entry> = {}
): Entry[] {
  return Array.from({ length: count }, () =>
    createEntry(contentTypeId, authorId, overrides)
  );
}

/**
 * Reset entry counter (for test isolation)
 */
export function resetEntryCounter(): void {
  entryCounter = 0;
}
