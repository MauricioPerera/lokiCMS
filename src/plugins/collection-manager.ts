/**
 * LokiCMS Plugin System - Collection Manager
 * Manager for plugin database collections
 */

import type { Collection } from '../lib/lokijs/index.js';
import type { CollectionConfig } from './types.js';
import { getDatabase } from '../db/index.js';

/**
 * Plugin Collection Manager - manages database collections for plugins
 */
class PluginCollectionManager {
  private collections: Map<string, { pluginName: string; collection: Collection<Record<string, unknown>> }> = new Map();

  /**
   * Create a new collection for a plugin
   * @param config - Collection configuration
   * @param pluginName - Name of the plugin creating the collection
   */
  create<T extends object>(config: CollectionConfig<T>, pluginName: string): Collection<T> {
    const db = getDatabase();

    if (!db) {
      throw new Error('Database not initialized');
    }

    // Check if collection already exists
    let collection = db.getCollection<T>(config.name);

    if (!collection) {
      collection = db.addCollection<T>(config.name, {
        unique: config.options?.unique,
        indices: config.options?.indices,
      });
      console.log(`[CollectionManager] Created collection: ${config.name} (for ${pluginName})`);
    } else {
      console.log(`[CollectionManager] Collection '${config.name}' already exists, reusing`);
    }

    this.collections.set(config.name, {
      pluginName,
      collection: collection as Collection<Record<string, unknown>>,
    });

    return collection;
  }

  /**
   * Get an existing collection
   */
  get<T extends object>(name: string): Collection<T> | null {
    const db = getDatabase();
    if (!db) {
      return null;
    }
    return db.getCollection<T>(name);
  }

  /**
   * Drop a collection
   */
  drop(name: string): void {
    const db = getDatabase();
    if (!db) {
      return;
    }

    const collection = db.getCollection(name);
    if (collection) {
      db.removeCollection(name);
      this.collections.delete(name);
      console.log(`[CollectionManager] Dropped collection: ${name}`);
    }
  }

  /**
   * Drop all collections for a plugin
   */
  dropByPlugin(pluginName: string): void {
    const toRemove: string[] = [];
    for (const [name, { pluginName: pn }] of this.collections.entries()) {
      if (pn === pluginName) {
        toRemove.push(name);
      }
    }
    for (const name of toRemove) {
      this.drop(name);
    }
    if (toRemove.length > 0) {
      console.log(`[CollectionManager] Dropped ${toRemove.length} collections for plugin '${pluginName}'`);
    }
  }

  /**
   * Get all collection names managed by plugins
   */
  getPluginCollections(): string[] {
    return Array.from(this.collections.keys());
  }

  /**
   * Get collections for a specific plugin
   */
  getByPlugin(pluginName: string): string[] {
    const result: string[] = [];
    for (const [name, { pluginName: pn }] of this.collections.entries()) {
      if (pn === pluginName) {
        result.push(name);
      }
    }
    return result;
  }

  /**
   * Check if a collection exists
   */
  has(name: string): boolean {
    return this.collections.has(name);
  }

  /**
   * Get count of managed collections
   */
  get count(): number {
    return this.collections.size;
  }

  /**
   * Clear all managed collections (for testing)
   */
  clear(): void {
    for (const name of this.collections.keys()) {
      this.drop(name);
    }
  }
}

// Singleton instance
export const pluginCollectionManager = new PluginCollectionManager();
