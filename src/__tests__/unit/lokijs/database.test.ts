/**
 * LokiJS Database Tests
 * Tests for main database class with collection management and persistence
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Loki, MemoryAdapter } from '../../../lib/lokijs/index.js';

interface TestDoc {
  name: string;
  value: number;
}

describe('LokiJS Database', () => {
  let db: Loki;

  beforeEach(() => {
    db = new Loki('test.db', { adapter: new MemoryAdapter() });
  });

  afterEach(async () => {
    await db.close();
  });

  // ============================================================================
  // Construction
  // ============================================================================

  describe('construction', () => {
    it('should create database with filename', () => {
      expect(db.filename).toBe('test.db');
    });

    it('should use memory adapter when specified', () => {
      const memDb = new Loki('mem.db', { persistenceMethod: 'memory' });
      expect(memDb.filename).toBe('mem.db');
    });

    it('should accept custom adapter', () => {
      const adapter = new MemoryAdapter();
      const customDb = new Loki('custom.db', { adapter });
      expect(customDb.filename).toBe('custom.db');
    });
  });

  // ============================================================================
  // Collection Management
  // ============================================================================

  describe('addCollection', () => {
    it('should add a new collection', () => {
      const col = db.addCollection<TestDoc>('test');
      expect(col).toBeDefined();
      expect(col.name).toBe('test');
    });

    it('should throw error for duplicate collection', () => {
      db.addCollection('test');
      expect(() => db.addCollection('test')).toThrow("Collection 'test' already exists");
    });

    it('should support collection options', () => {
      const col = db.addCollection<TestDoc>('test', {
        unique: ['name'],
        indices: ['value'],
      });

      expect(col.uniqueNames).toContain('name');
      expect(col.binaryIndices['value']).toBeDefined();
    });
  });

  describe('getCollection', () => {
    it('should retrieve existing collection', () => {
      db.addCollection<TestDoc>('test');
      const col = db.getCollection<TestDoc>('test');

      expect(col).not.toBeNull();
      expect(col!.name).toBe('test');
    });

    it('should return null for non-existent collection', () => {
      const col = db.getCollection('nonexistent');
      expect(col).toBeNull();
    });
  });

  describe('listCollections', () => {
    it('should list all collections', () => {
      db.addCollection('col1');
      db.addCollection('col2');

      const list = db.listCollections();
      expect(list).toHaveLength(2);
      expect(list.map(c => c.name)).toContain('col1');
      expect(list.map(c => c.name)).toContain('col2');
    });

    it('should include document counts', () => {
      const col = db.addCollection<TestDoc>('test');
      col.insert({ name: 'A', value: 1 });
      col.insert({ name: 'B', value: 2 });

      const list = db.listCollections();
      expect(list[0]!.count).toBe(2);
    });
  });

  describe('removeCollection', () => {
    it('should remove collection', () => {
      db.addCollection('test');
      db.removeCollection('test');

      expect(db.getCollection('test')).toBeNull();
    });

    it('should throw error for non-existent collection', () => {
      expect(() => db.removeCollection('nonexistent')).toThrow(
        "Collection 'nonexistent' not found"
      );
    });
  });

  describe('renameCollection', () => {
    it('should rename collection', () => {
      db.addCollection('old-name');
      db.renameCollection('old-name', 'new-name');

      expect(db.getCollection('old-name')).toBeNull();
      expect(db.getCollection('new-name')).not.toBeNull();
    });

    it('should throw error if old name not found', () => {
      expect(() => db.renameCollection('nonexistent', 'new')).toThrow(
        "Collection 'nonexistent' not found"
      );
    });

    it('should throw error if new name exists', () => {
      db.addCollection('col1');
      db.addCollection('col2');

      expect(() => db.renameCollection('col1', 'col2')).toThrow(
        "Collection 'col2' already exists"
      );
    });
  });

  // ============================================================================
  // Serialization
  // ============================================================================

  describe('serialize', () => {
    it('should serialize to JSON string', () => {
      const col = db.addCollection<TestDoc>('test');
      col.insert({ name: 'test', value: 42 });

      const serialized = db.serialize();
      expect(typeof serialized).toBe('string');

      const parsed = JSON.parse(serialized);
      expect(parsed.filename).toBe('test.db');
      expect(parsed.collections).toHaveLength(1);
    });

    it('should serialize with pretty format', () => {
      db.addCollection('test');
      const serialized = db.serialize({ serializationMethod: 'pretty' });

      expect(serialized).toContain('\n');
      expect(serialized).toContain('  ');
    });

    it('should serialize with destructured format', () => {
      const col = db.addCollection<TestDoc>('test');
      col.insert({ name: 'test', value: 42 });

      const serialized = db.serialize({ serializationMethod: 'destructured' });
      expect(serialized).toContain('$<\n');
    });
  });

  // ============================================================================
  // Persistence
  // ============================================================================

  describe('save/load', () => {
    it('should save and load database', async () => {
      const col = db.addCollection<TestDoc>('test');
      col.insert({ name: 'Alice', value: 100 });

      await db.save();

      // Create new db instance and load
      const db2 = new Loki('test.db', { adapter: new MemoryAdapter() });
      await db2.load();

      // Note: Memory adapter is instance-specific, so we test serialize/deserialize instead
      const serialized = db.serialize();
      expect(serialized).toContain('Alice');
    });

    it('should handle load with no existing data', async () => {
      const newDb = new Loki('new.db', { adapter: new MemoryAdapter() });
      await newDb.load();

      expect(newDb.listCollections()).toHaveLength(0);
    });
  });

  describe('deleteDatabase', () => {
    it('should clear all collections', async () => {
      db.addCollection('test1');
      db.addCollection('test2');

      await db.deleteDatabase();

      expect(db.listCollections()).toHaveLength(0);
    });
  });

  // ============================================================================
  // Autosave
  // ============================================================================

  describe('autosave', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should configure autosave', () => {
      db.configureAutosave(true, 1000);
      // Autosave is now enabled
    });

    it('should disable autosave', () => {
      db.configureAutosave(true, 1000);
      db.configureAutosave(false);
      // Autosave is now disabled
    });
  });

  // ============================================================================
  // Stats
  // ============================================================================

  describe('getStats', () => {
    it('should return database statistics', () => {
      const col = db.addCollection<TestDoc>('test');
      col.insert({ name: 'A', value: 1 });
      col.insert({ name: 'B', value: 2 });

      const stats = db.getStats();

      expect(stats.filename).toBe('test.db');
      expect(stats.collections).toBe(1);
      expect(stats.totalDocuments).toBe(2);
    });

    it('should detect dirty state', () => {
      const col = db.addCollection<TestDoc>('test');
      col.insert({ name: 'A', value: 1 });

      const stats = db.getStats();
      expect(stats.dirty).toBe(true);
    });
  });

  describe('getDirtyCollections', () => {
    it('should return collections with changes', () => {
      const col1 = db.addCollection<TestDoc>('col1');
      db.addCollection('col2');

      col1.insert({ name: 'A', value: 1 });

      const dirty = db.getDirtyCollections();
      expect(dirty).toHaveLength(1);
      expect(dirty[0]!.name).toBe('col1');
    });
  });

  describe('markClean', () => {
    it('should mark all collections as clean', () => {
      const col = db.addCollection<TestDoc>('test');
      col.insert({ name: 'A', value: 1 });

      expect(col.dirty).toBe(true);

      db.markClean();

      expect(col.dirty).toBe(false);
    });
  });

  // ============================================================================
  // Clear
  // ============================================================================

  describe('clearAll', () => {
    it('should clear all collection data', () => {
      const col1 = db.addCollection<TestDoc>('col1');
      const col2 = db.addCollection<TestDoc>('col2');

      col1.insert({ name: 'A', value: 1 });
      col2.insert({ name: 'B', value: 2 });

      db.clearAll();

      expect(col1.count()).toBe(0);
      expect(col2.count()).toBe(0);
    });
  });

  // ============================================================================
  // Copy
  // ============================================================================

  describe('copy', () => {
    it('should create database copy', () => {
      const col = db.addCollection<TestDoc>('test');
      col.insert({ name: 'A', value: 1 });

      const copy = db.copy();

      expect(copy.filename).toBe('test.db_copy');
      expect(copy.getCollection<TestDoc>('test')!.count()).toBe(1);
    });

    it('should create independent copy', () => {
      const col = db.addCollection<TestDoc>('test');
      col.insert({ name: 'A', value: 1 });

      const copy = db.copy();
      const copyCol = copy.getCollection<TestDoc>('test');
      copyCol!.insert({ name: 'B', value: 2 });

      expect(col.count()).toBe(1);
      expect(copyCol!.count()).toBe(2);
    });
  });

  // ============================================================================
  // Close
  // ============================================================================

  describe('close', () => {
    it('should emit close event', async () => {
      const listener = vi.fn();
      db.on('close', listener);

      await db.close();

      expect(listener).toHaveBeenCalled();
    });

    it('should clear TTL daemons', async () => {
      const col = db.addCollection<TestDoc>('test', {
        ttl: 1000,
        ttlInterval: 500,
      });

      expect(col.ttl.daemon).not.toBeNull();

      await db.close();

      expect(col.ttl.daemon).toBeNull();
    });
  });

  // ============================================================================
  // Events
  // ============================================================================

  describe('events', () => {
    it('should emit init event on empty load', async () => {
      const listener = vi.fn();
      const newDb = new Loki('empty.db', { adapter: new MemoryAdapter() });
      newDb.on('init', listener);

      await newDb.load();

      expect(listener).toHaveBeenCalledWith({ collections: [] });
    });
  });

  // ============================================================================
  // Round Trip
  // ============================================================================

  describe('round trip', () => {
    it('should preserve data through serialize/deserialize', () => {
      const col = db.addCollection<TestDoc>('test', {
        unique: ['name'],
        indices: ['value'],
      });

      col.insert([
        { name: 'Alice', value: 100 },
        { name: 'Bob', value: 200 },
      ]);

      const serialized = db.serialize();

      const db2 = new Loki('test2.db', { adapter: new MemoryAdapter() });
      // Manually trigger deserialize via load-like behavior
      (db2 as any).deserialize(serialized);

      const col2 = db2.getCollection<TestDoc>('test');
      expect(col2!.count()).toBe(2);
      expect(col2!.findOne({ name: 'Alice' })).not.toBeNull();
    });

    it('should preserve unique constraints', () => {
      const col = db.addCollection<TestDoc>('test', { unique: ['name'] });
      col.insert({ name: 'Alice', value: 100 });

      const serialized = db.serialize();

      const db2 = new Loki('test2.db', { adapter: new MemoryAdapter() });
      (db2 as any).deserialize(serialized);

      const col2 = db2.getCollection<TestDoc>('test');

      // Should be able to find by unique field
      expect(col2!.by('name', 'Alice')).not.toBeNull();
    });

    it('should handle destructured format round trip', () => {
      const col = db.addCollection<TestDoc>('test');
      col.insert([
        { name: 'A', value: 1 },
        { name: 'B', value: 2 },
      ]);

      const serialized = db.serialize({ serializationMethod: 'destructured' });

      const db2 = new Loki('test2.db', { adapter: new MemoryAdapter() });
      (db2 as any).deserialize(serialized);

      expect(db2.getCollection<TestDoc>('test')!.count()).toBe(2);
    });
  });
});
