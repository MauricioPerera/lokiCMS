/**
 * Test Database Utilities
 * Creates isolated in-memory database instances for each test
 */

import { Loki, MemoryAdapter } from '../../lib/lokijs/index.js';
import type { Collection } from '../../lib/lokijs/index.js';
import type { ContentType, Entry, Taxonomy, Term, User } from '../../models/index.js';

export interface TestDatabase {
  db: Loki;
  users: Collection<User>;
  entries: Collection<Entry>;
  contentTypes: Collection<ContentType>;
  taxonomies: Collection<Taxonomy>;
  terms: Collection<Term>;
  cleanup: () => Promise<void>;
}

/**
 * Create a fresh in-memory database for testing
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const adapter = new MemoryAdapter();
  const db = new Loki('test-db.json', {
    adapter,
    autosave: false,
    verbose: false,
  });

  // Create collections matching production configuration
  const users = db.addCollection<User>('users', {
    unique: ['email'],
    indices: ['role', 'isActive'],
  });

  const contentTypes = db.addCollection<ContentType>('contentTypes', {
    unique: ['slug'],
    indices: ['name'],
  });

  const entries = db.addCollection<Entry>('entries', {
    indices: ['contentTypeId', 'contentTypeSlug', 'status', 'authorId', 'createdAt', 'publishedAt'],
  });

  const taxonomies = db.addCollection<Taxonomy>('taxonomies', {
    unique: ['slug'],
    indices: ['name'],
  });

  const terms = db.addCollection<Term>('terms', {
    indices: ['taxonomyId', 'taxonomySlug', 'parentId', 'slug'],
  });

  return {
    db,
    users,
    entries,
    contentTypes,
    taxonomies,
    terms,
    cleanup: async () => {
      users.clear();
      entries.clear();
      contentTypes.clear();
      taxonomies.clear();
      terms.clear();
      await db.close();
    },
  };
}

/**
 * Create a minimal test database (for LokiJS unit tests)
 */
export function createMinimalTestDatabase(): Loki {
  const adapter = new MemoryAdapter();
  return new Loki('minimal-test.json', {
    adapter,
    autosave: false,
    verbose: false,
  });
}

/**
 * Mock collection getters for service layer injection
 */
let testDb: TestDatabase | null = null;

export function setTestDatabase(db: TestDatabase): void {
  testDb = db;
}

export function getTestDatabase(): TestDatabase {
  if (!testDb) {
    throw new Error('Test database not initialized. Call setTestDatabase() first.');
  }
  return testDb;
}

export function clearTestDatabase(): void {
  testDb = null;
}

// Mock collection getters that match the production db/index.ts interface
export function getTestUsersCollection(): Collection<User> {
  return getTestDatabase().users;
}

export function getTestEntriesCollection(): Collection<Entry> {
  return getTestDatabase().entries;
}

export function getTestContentTypesCollection(): Collection<ContentType> {
  return getTestDatabase().contentTypes;
}

export function getTestTaxonomiesCollection(): Collection<Taxonomy> {
  return getTestDatabase().taxonomies;
}

export function getTestTermsCollection(): Collection<Term> {
  return getTestDatabase().terms;
}
