/**
 * Database Configuration
 * LokiJS database initialization and collections
 */

import { Loki, FsAdapter } from '../lib/lokijs/index.js';
import type { Collection } from '../lib/lokijs/index.js';
import type { ContentType, Entry, Taxonomy, Term, User } from '../models/index.js';

// Database instance
let db: Loki | null = null;

// Collection references
let contentTypes: Collection<ContentType> | null = null;
let entries: Collection<Entry> | null = null;
let taxonomies: Collection<Taxonomy> | null = null;
let terms: Collection<Term> | null = null;
let users: Collection<User> | null = null;

// Database configuration
export interface DatabaseConfig {
  path: string;
  autosave?: boolean;
  autosaveInterval?: number;
}

// Initialize database
export async function initDatabase(config: DatabaseConfig): Promise<Loki> {
  const adapter = new FsAdapter();

  db = new Loki(config.path, {
    adapter,
    autosave: config.autosave ?? true,
    autosaveInterval: config.autosaveInterval ?? 5000,
    verbose: false,
  });

  // Try to load existing database
  await db.load();

  // Initialize collections if they don't exist
  contentTypes = db.getCollection<ContentType>('contentTypes');
  if (!contentTypes) {
    contentTypes = db.addCollection<ContentType>('contentTypes', {
      unique: ['slug'],
      indices: ['name'],
    });
  }

  entries = db.getCollection<Entry>('entries');
  if (!entries) {
    entries = db.addCollection<Entry>('entries', {
      unique: ['slug'],
      indices: ['contentTypeId', 'contentTypeSlug', 'status', 'authorId', 'createdAt', 'publishedAt'],
    });
  }

  taxonomies = db.getCollection<Taxonomy>('taxonomies');
  if (!taxonomies) {
    taxonomies = db.addCollection<Taxonomy>('taxonomies', {
      unique: ['slug'],
      indices: ['name'],
    });
  }

  terms = db.getCollection<Term>('terms');
  if (!terms) {
    terms = db.addCollection<Term>('terms', {
      indices: ['taxonomyId', 'taxonomySlug', 'parentId', 'slug'],
    });
  }

  users = db.getCollection<User>('users');
  if (!users) {
    users = db.addCollection<User>('users', {
      unique: ['email'],
      indices: ['role', 'isActive'],
    });
  }

  return db;
}

// Get database instance
export function getDatabase(): Loki {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

// Get collections
export function getContentTypesCollection(): Collection<ContentType> {
  if (!contentTypes) {
    throw new Error('Database not initialized');
  }
  return contentTypes;
}

export function getEntriesCollection(): Collection<Entry> {
  if (!entries) {
    throw new Error('Database not initialized');
  }
  return entries;
}

export function getTaxonomiesCollection(): Collection<Taxonomy> {
  if (!taxonomies) {
    throw new Error('Database not initialized');
  }
  return taxonomies;
}

export function getTermsCollection(): Collection<Term> {
  if (!terms) {
    throw new Error('Database not initialized');
  }
  return terms;
}

export function getUsersCollection(): Collection<User> {
  if (!users) {
    throw new Error('Database not initialized');
  }
  return users;
}

// Close database
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
    contentTypes = null;
    entries = null;
    taxonomies = null;
    terms = null;
    users = null;
  }
}

// Save database manually
export async function saveDatabase(): Promise<void> {
  if (db) {
    await db.save();
  }
}

// ============================================================================
// Plugin Collection Support
// ============================================================================

// Track plugin collections
const pluginCollections: Map<string, Collection<Record<string, unknown>>> = new Map();

/**
 * Add a plugin collection
 */
export function addPluginCollection<T extends object>(
  name: string,
  options?: {
    unique?: (keyof T)[];
    indices?: (keyof T)[];
  }
): Collection<T> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  let collection = db.getCollection<T>(name);
  if (!collection) {
    collection = db.addCollection<T>(name, options);
    console.log(`[Database] Created plugin collection: ${name}`);
  }

  pluginCollections.set(name, collection as unknown as Collection<Record<string, unknown>>);
  return collection;
}

/**
 * Get a plugin collection
 */
export function getPluginCollection<T extends object>(name: string): Collection<T> | null {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db.getCollection<T>(name);
}

/**
 * Remove a plugin collection
 */
export function removePluginCollection(name: string): void {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const collection = db.getCollection(name);
  if (collection) {
    db.removeCollection(name);
    pluginCollections.delete(name);
    console.log(`[Database] Removed plugin collection: ${name}`);
  }
}

/**
 * List all plugin collections
 */
export function listPluginCollections(): string[] {
  return Array.from(pluginCollections.keys());
}

// Export for convenience
export { db, contentTypes, entries, taxonomies, terms, users };
