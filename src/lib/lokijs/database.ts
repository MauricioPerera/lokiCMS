/**
 * LokiJS Modernized - Database
 * Main database class with collection management and persistence
 */

import { LokiEventEmitter, type DatabaseEvents } from './events.js';
import { Collection } from './collection.js';
import { FsAdapter, MemoryAdapter } from './adapters.js';
import { debounce, throttle } from './utils.js';
import type {
  DatabaseOptions,
  PersistenceAdapter,
  CollectionOptions,
  SerializedDatabase,
  SerializedCollection,
} from './types.js';

const ENGINE_VERSION = 2.0;
const DATABASE_VERSION = 1.0;

export class Loki extends LokiEventEmitter<DatabaseEvents> {
  filename: string;
  collections: Collection[] = [];
  private adapter: PersistenceAdapter;
  private autosave: boolean;
  private autosaveInterval: number;
  private autosaveHandle: ReturnType<typeof setInterval> | null = null;
  private throttledSaves: boolean;
  private persistenceMethod: 'fs' | 'memory' | null;
  private verbose: boolean;
  private serializationMethod: 'normal' | 'pretty' | 'destructured';
  private destructureDelimiter: string;
  private databaseVersion: number = DATABASE_VERSION;
  private engineVersion: number = ENGINE_VERSION;

  constructor(filename: string, options: DatabaseOptions = {}) {
    super();
    this.filename = filename;

    // Set up adapter
    if (options.adapter) {
      this.adapter = options.adapter;
      this.persistenceMethod = null;
    } else if (options.persistenceMethod === 'memory') {
      this.adapter = new MemoryAdapter();
      this.persistenceMethod = 'memory';
    } else {
      this.adapter = new FsAdapter();
      this.persistenceMethod = 'fs';
    }

    this.autosave = options.autosave ?? false;
    this.autosaveInterval = options.autosaveInterval ?? 5000;
    this.throttledSaves = true;
    this.verbose = options.verbose ?? false;
    this.serializationMethod = options.serializationMethod ?? 'normal';
    this.destructureDelimiter = options.destructureDelimiter ?? '$<\n';

    // Handle autoload
    if (options.autoload) {
      this.loadDatabase().then(() => {
        options.autoloadCallback?.();
      }).catch(err => {
        this.emit('error', err);
      });
    }

    // Setup autosave
    if (this.autosave) {
      this.startAutosave();
    }
  }

  // Add a collection
  addCollection<T extends object>(
    name: string,
    options?: CollectionOptions<T>
  ): Collection<T> {
    // Check if collection already exists
    const existingIdx = this.collections.findIndex(c => c.name === name);
    if (existingIdx !== -1) {
      throw new Error(`Collection '${name}' already exists`);
    }

    const collection = new Collection<T>(name, options);
    this.collections.push(collection as unknown as Collection);

    if (this.verbose) {
      console.log(`Collection '${name}' added`);
    }

    return collection;
  }

  // Get collection by name
  getCollection<T extends object>(name: string): Collection<T> | null {
    const collection = this.collections.find(c => c.name === name);
    return (collection as unknown as Collection<T>) ?? null;
  }

  // List all collection names
  listCollections(): Array<{ name: string; count: number }> {
    return this.collections.map(c => ({
      name: c.name,
      count: c.count(),
    }));
  }

  // Remove a collection
  removeCollection(name: string): void {
    const idx = this.collections.findIndex(c => c.name === name);
    if (idx === -1) {
      throw new Error(`Collection '${name}' not found`);
    }
    this.collections.splice(idx, 1);

    if (this.verbose) {
      console.log(`Collection '${name}' removed`);
    }
  }

  // Rename a collection
  renameCollection(oldName: string, newName: string): Collection | null {
    const collection = this.getCollection(oldName);
    if (!collection) {
      throw new Error(`Collection '${oldName}' not found`);
    }

    // Check if new name already exists
    if (this.getCollection(newName)) {
      throw new Error(`Collection '${newName}' already exists`);
    }

    collection.name = newName;
    return collection;
  }

  // Serialize database to string
  serialize(options?: { serializationMethod?: 'normal' | 'pretty' | 'destructured' }): string {
    const method = options?.serializationMethod ?? this.serializationMethod;

    const serialized: SerializedDatabase = {
      filename: this.filename,
      collections: this.collections.map(c => c.serialize()),
      databaseVersion: this.databaseVersion,
      engineVersion: this.engineVersion,
      autosave: this.autosave,
      autosaveInterval: this.autosaveInterval,
      autosaveHandle: null,
      throttledSaves: this.throttledSaves,
      persistenceMethod: this.persistenceMethod,
      persistenceAdapter: null,
      verbose: this.verbose,
      events: {},
    };

    switch (method) {
      case 'pretty':
        return JSON.stringify(serialized, null, 2);
      case 'destructured':
        return this.serializeDestructured(serialized);
      default:
        return JSON.stringify(serialized);
    }
  }

  // Destructured serialization for large databases
  private serializeDestructured(data: SerializedDatabase): string {
    const lines: string[] = [];

    // Database metadata
    const dbMeta = {
      ...data,
      collections: data.collections.map(c => ({
        name: c.name,
        count: c.data.length,
      })),
    };
    lines.push(JSON.stringify(dbMeta));

    // Each collection's data on separate lines
    for (const collection of data.collections) {
      lines.push(this.destructureDelimiter);
      lines.push(JSON.stringify({
        name: collection.name,
        options: collection.options,
        idIndex: collection.idIndex,
        binaryIndices: collection.binaryIndices,
        uniqueNames: collection.uniqueNames,
        transforms: collection.transforms,
        maxId: collection.maxId,
        dynamicViews: collection.dynamicViews,
      }));

      // Data items on separate lines
      for (const doc of collection.data) {
        lines.push(JSON.stringify(doc));
      }
    }

    return lines.join('\n');
  }

  // Deserialize database from string
  private deserialize(data: string): void {
    // Check for destructured format
    if (data.includes(this.destructureDelimiter)) {
      this.deserializeDestructured(data);
      return;
    }

    const parsed: SerializedDatabase = JSON.parse(data);

    // Validate version
    if (parsed.engineVersion && parsed.engineVersion > ENGINE_VERSION) {
      console.warn(
        `Database was saved with engine version ${parsed.engineVersion}, ` +
        `current version is ${ENGINE_VERSION}`
      );
    }

    // Load collections
    this.collections = [];
    for (const collectionData of parsed.collections) {
      const collection = Collection.deserialize(collectionData);
      this.collections.push(collection);
    }

    this.emit('loaded', { filename: this.filename });
  }

  // Deserialize destructured format
  private deserializeDestructured(data: string): void {
    const parts = data.split(this.destructureDelimiter);
    const dbMeta = JSON.parse(parts[0]!);

    this.collections = [];

    for (let i = 1; i < parts.length; i++) {
      const lines = parts[i]!.split('\n').filter(l => l.trim());
      if (lines.length === 0) continue;

      const collectionMeta = JSON.parse(lines[0]!);
      const collection = new Collection(collectionMeta.name, collectionMeta.options);

      collection.idIndex = collectionMeta.idIndex;
      collection.maxId = collectionMeta.maxId;
      collection.transforms = collectionMeta.transforms;
      collection.uniqueNames = collectionMeta.uniqueNames;

      // Parse data items
      for (let j = 1; j < lines.length; j++) {
        const doc = JSON.parse(lines[j]!);
        collection.data.push(doc);
      }

      // Rebuild indices
      for (const field of collection.uniqueNames) {
        collection.constraints.unique[field as string] = {
          field,
          keyMap: new Map(),
        };
        for (const doc of collection.data) {
          collection.constraints.unique[field as string]!.keyMap.set(doc[field], doc);
        }
      }

      this.collections.push(collection);
    }

    this.emit('loaded', { filename: this.filename });
  }

  // Save database
  async saveDatabase(): Promise<void> {
    const data = this.serialize();
    await this.adapter.saveDatabase(this.filename, data);

    if (this.verbose) {
      console.log(`Database saved to ${this.filename}`);
    }
  }

  // Save database (alias)
  async save(): Promise<void> {
    return this.saveDatabase();
  }

  // Load database
  async loadDatabase(): Promise<void> {
    const data = await this.adapter.loadDatabase(this.filename);

    if (data === null) {
      // No existing database
      this.emit('init', { collections: [] });
      return;
    }

    this.deserialize(data);

    if (this.verbose) {
      console.log(`Database loaded from ${this.filename}`);
    }
  }

  // Load database (alias)
  async load(): Promise<void> {
    return this.loadDatabase();
  }

  // Delete database
  async deleteDatabase(): Promise<void> {
    if (this.adapter.deleteDatabase) {
      await this.adapter.deleteDatabase(this.filename);
    }

    // Clear in-memory data
    this.collections = [];

    if (this.verbose) {
      console.log(`Database ${this.filename} deleted`);
    }
  }

  // Start autosave timer
  private startAutosave(): void {
    if (this.autosaveHandle) {
      clearInterval(this.autosaveHandle);
    }

    const saveFunction = this.throttledSaves
      ? throttle(() => this.saveDatabase(), this.autosaveInterval)
      : () => this.saveDatabase();

    this.autosaveHandle = setInterval(saveFunction, this.autosaveInterval);
  }

  // Stop autosave
  private stopAutosave(): void {
    if (this.autosaveHandle) {
      clearInterval(this.autosaveHandle);
      this.autosaveHandle = null;
    }
  }

  // Configure autosave
  configureAutosave(enabled: boolean, interval?: number): void {
    this.autosave = enabled;
    if (interval !== undefined) {
      this.autosaveInterval = interval;
    }

    if (enabled) {
      this.startAutosave();
    } else {
      this.stopAutosave();
    }
  }

  // Close database
  async close(): Promise<void> {
    // Stop autosave
    this.stopAutosave();

    // Final save if autosave was enabled
    if (this.autosave) {
      await this.saveDatabase();
    }

    // Clear TTL daemons
    for (const collection of this.collections) {
      if (collection.ttl.daemon) {
        clearInterval(collection.ttl.daemon);
        collection.ttl.daemon = null;
      }
    }

    this.emit('close');

    if (this.verbose) {
      console.log('Database closed');
    }
  }

  // Get dirty collections (have changes)
  getDirtyCollections(): Collection[] {
    return this.collections.filter(c => c.dirty);
  }

  // Mark all collections as clean
  markClean(): void {
    for (const collection of this.collections) {
      collection.dirty = false;
    }
  }

  // Clear all data
  clearAll(): void {
    for (const collection of this.collections) {
      collection.clear();
    }
  }

  // Get database stats
  getStats(): {
    filename: string;
    collections: number;
    totalDocuments: number;
    dirty: boolean;
  } {
    return {
      filename: this.filename,
      collections: this.collections.length,
      totalDocuments: this.collections.reduce((sum, c) => sum + c.count(), 0),
      dirty: this.getDirtyCollections().length > 0,
    };
  }

  // Create a copy/clone of the database
  copy(): Loki {
    const serialized = this.serialize();
    const db = new Loki(this.filename + '_copy', {
      persistenceMethod: 'memory',
    });
    db.deserialize(serialized);
    return db;
  }

  // Backup to file
  async backup(filepath: string): Promise<void> {
    const adapter = new FsAdapter();
    const data = this.serialize({ serializationMethod: 'pretty' });
    await adapter.saveDatabase(filepath, data);
  }

  // Restore from backup
  async restore(filepath: string): Promise<void> {
    const adapter = new FsAdapter();
    const data = await adapter.loadDatabase(filepath);
    if (data) {
      this.deserialize(data);
    }
  }
}
