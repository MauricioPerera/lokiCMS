/**
 * LokiJS Collection Tests
 * Tests for document storage with indexing, querying, and events
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Collection } from '../../../lib/lokijs/collection.js';
import { Loki, MemoryAdapter } from '../../../lib/lokijs/index.js';

interface TestDoc {
  name: string;
  age: number;
  email?: string;
  active?: boolean;
  tags?: string[];
}

describe('LokiJS Collection', () => {
  let db: Loki;
  let collection: Collection<TestDoc>;

  beforeEach(() => {
    db = new Loki('test.db', { adapter: new MemoryAdapter() });
    collection = db.addCollection<TestDoc>('test');
  });

  afterEach(async () => {
    await db.close();
  });

  // ============================================================================
  // Insert Operations
  // ============================================================================

  describe('insert', () => {
    it('should insert a single document', () => {
      const doc = collection.insert({ name: 'John', age: 30 });

      expect(doc.$loki).toBe(1);
      expect(doc.name).toBe('John');
      expect(doc.age).toBe(30);
      expect(doc.meta).toBeDefined();
      expect(doc.meta.created).toBeDefined();
      expect(doc.meta.revision).toBe(0);
    });

    it('should insert multiple documents', () => {
      const docs = collection.insert([
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ]);

      expect(Array.isArray(docs)).toBe(true);
      expect(docs).toHaveLength(2);
      expect((docs as any)[0].$loki).toBe(1);
      expect((docs as any)[1].$loki).toBe(2);
    });

    it('should auto-increment IDs', () => {
      const doc1 = collection.insert({ name: 'A', age: 1 });
      const doc2 = collection.insert({ name: 'B', age: 2 });
      const doc3 = collection.insert({ name: 'C', age: 3 });

      expect(doc1.$loki).toBe(1);
      expect(doc2.$loki).toBe(2);
      expect(doc3.$loki).toBe(3);
    });

    it('should emit insert event', () => {
      const listener = vi.fn();
      collection.on('insert', listener);

      const doc = collection.insert({ name: 'John', age: 30 });

      expect(listener).toHaveBeenCalledWith(doc);
    });

    it('should emit pre-insert event', () => {
      const listener = vi.fn();
      collection.on('pre-insert', listener);

      collection.insert({ name: 'John', age: 30 });

      expect(listener).toHaveBeenCalled();
    });

    it('should clone objects when cloneObjects option is true', () => {
      const cloneCollection = db.addCollection<TestDoc>('clone-test', { clone: true });
      const original = { name: 'John', age: 30 };
      const doc = cloneCollection.insert(original);

      original.name = 'Modified';

      expect(doc.name).toBe('John'); // Should not be affected
    });

    it('should set dirty flag after insert', () => {
      expect(collection.dirty).toBe(false);
      collection.insert({ name: 'John', age: 30 });
      expect(collection.dirty).toBe(true);
    });
  });

  // ============================================================================
  // Find Operations
  // ============================================================================

  describe('find', () => {
    beforeEach(() => {
      collection.insert([
        { name: 'John', age: 30, active: true },
        { name: 'Jane', age: 25, active: true },
        { name: 'Bob', age: 35, active: false },
      ]);
    });

    it('should find all documents without query', () => {
      const results = collection.find();
      expect(results).toHaveLength(3);
    });

    it('should find documents with simple query', () => {
      const results = collection.find({ name: 'John' });
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('John');
    });

    it('should find documents with operator query', () => {
      const results = collection.find({ age: { $gt: 25 } });
      expect(results).toHaveLength(2);
    });

    it('should return empty array for no matches', () => {
      const results = collection.find({ name: 'Nobody' });
      expect(results).toHaveLength(0);
    });
  });

  describe('findOne', () => {
    beforeEach(() => {
      collection.insert([
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ]);
    });

    it('should find first matching document', () => {
      const doc = collection.findOne({ name: 'John' });
      expect(doc).not.toBeNull();
      expect(doc!.name).toBe('John');
    });

    it('should return null for no match', () => {
      const doc = collection.findOne({ name: 'Nobody' });
      expect(doc).toBeNull();
    });

    it('should return first document without query', () => {
      const doc = collection.findOne();
      expect(doc).not.toBeNull();
    });
  });

  describe('get / findById', () => {
    it('should find document by $loki ID', () => {
      const inserted = collection.insert({ name: 'John', age: 30 });
      const found = collection.get(inserted.$loki);

      expect(found).not.toBeNull();
      expect(found!.$loki).toBe(inserted.$loki);
    });

    it('should return null for non-existent ID', () => {
      const found = collection.get(999);
      expect(found).toBeNull();
    });

    it('should work with findById alias', () => {
      const inserted = collection.insert({ name: 'John', age: 30 });
      const found = collection.findById(inserted.$loki);

      expect(found).toEqual(inserted);
    });
  });

  // ============================================================================
  // Update Operations
  // ============================================================================

  describe('update', () => {
    it('should update an existing document', () => {
      const doc = collection.insert({ name: 'John', age: 30 });
      doc.age = 31;
      collection.update(doc);

      const updated = collection.get(doc.$loki);
      expect(updated!.age).toBe(31);
    });

    it('should increment revision on update', () => {
      const doc = collection.insert({ name: 'John', age: 30 });
      expect(doc.meta.revision).toBe(0);

      doc.age = 31;
      collection.update(doc);

      const updated = collection.get(doc.$loki);
      expect(updated!.meta.revision).toBe(1);
    });

    it('should set updated timestamp', () => {
      const doc = collection.insert({ name: 'John', age: 30 });
      const originalCreated = doc.meta.created;

      doc.age = 31;
      collection.update(doc);

      const updated = collection.get(doc.$loki);
      expect(updated!.meta.updated).toBeDefined();
      expect(updated!.meta.created).toBe(originalCreated);
    });

    it('should emit update event', () => {
      const listener = vi.fn();
      collection.on('update', listener);

      const doc = collection.insert({ name: 'John', age: 30 });
      doc.age = 31;
      collection.update(doc);

      expect(listener).toHaveBeenCalled();
    });

    it('should throw error for non-existent document', () => {
      const fakeDoc = { $loki: 999, meta: { created: Date.now(), revision: 0 }, name: 'Fake', age: 0 };

      expect(() => collection.update(fakeDoc)).toThrow('Document with id 999 not found');
    });

    it('should throw error for document without $loki', () => {
      const invalidDoc = { name: 'Test', age: 25 } as any;

      expect(() => collection.update(invalidDoc)).toThrow('Document must have $loki property');
    });

    it('should update multiple documents', () => {
      const docs = collection.insert([
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ]) as any[];

      docs[0].age = 31;
      docs[1].age = 26;
      collection.update(docs);

      expect(collection.get(docs[0].$loki)!.age).toBe(31);
      expect(collection.get(docs[1].$loki)!.age).toBe(26);
    });
  });

  // ============================================================================
  // Remove Operations
  // ============================================================================

  describe('remove', () => {
    it('should remove document by reference', () => {
      const doc = collection.insert({ name: 'John', age: 30 });
      collection.remove(doc);

      expect(collection.get(doc.$loki)).toBeNull();
      expect(collection.count()).toBe(0);
    });

    it('should remove document by ID', () => {
      const doc = collection.insert({ name: 'John', age: 30 });
      collection.remove(doc.$loki);

      expect(collection.get(doc.$loki)).toBeNull();
    });

    it('should emit delete event', () => {
      const listener = vi.fn();
      collection.on('delete', listener);

      const doc = collection.insert({ name: 'John', age: 30 });
      collection.remove(doc);

      expect(listener).toHaveBeenCalledWith(doc);
    });

    it('should throw error for non-existent document', () => {
      expect(() => collection.remove(999)).toThrow('Document not found');
    });

    it('should update count after remove', () => {
      collection.insert([
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ]);

      expect(collection.count()).toBe(2);

      const doc = collection.findOne({ name: 'John' });
      collection.remove(doc!);

      expect(collection.count()).toBe(1);
    });
  });

  describe('findAndRemove', () => {
    it('should remove all matching documents', () => {
      collection.insert([
        { name: 'John', age: 30, active: false },
        { name: 'Jane', age: 25, active: true },
        { name: 'Bob', age: 35, active: false },
      ]);

      collection.findAndRemove({ active: false });

      expect(collection.count()).toBe(1);
      expect(collection.findOne()!.name).toBe('Jane');
    });
  });

  describe('findAndUpdate', () => {
    it('should update all matching documents', () => {
      collection.insert([
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ]);

      collection.findAndUpdate({ age: { $gte: 25 } }, doc => {
        doc.active = true;
        return doc;
      });

      const results = collection.find({ active: true });
      expect(results).toHaveLength(2);
    });
  });

  describe('clear', () => {
    it('should remove all documents', () => {
      collection.insert([
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ]);

      collection.clear();

      expect(collection.count()).toBe(0);
      expect(collection.find()).toHaveLength(0);
    });

    it('should reset maxId', () => {
      collection.insert({ name: 'John', age: 30 });
      collection.clear();
      const newDoc = collection.insert({ name: 'Jane', age: 25 });

      expect(newDoc.$loki).toBe(1); // Reset to 1
    });
  });

  // ============================================================================
  // Unique Constraints
  // ============================================================================

  describe('unique constraints', () => {
    let uniqueCollection: Collection<TestDoc>;

    beforeEach(() => {
      uniqueCollection = db.addCollection<TestDoc>('unique-test', {
        unique: ['email'],
      });
    });

    it('should enforce unique constraint on insert', () => {
      uniqueCollection.insert({ name: 'John', age: 30, email: 'john@test.com' });

      expect(() =>
        uniqueCollection.insert({ name: 'Jane', age: 25, email: 'john@test.com' })
      ).toThrow(/Unique constraint violation/);
    });

    it('should allow same unique value on update (same document)', () => {
      const doc = uniqueCollection.insert({ name: 'John', age: 30, email: 'john@test.com' });
      doc.age = 31;

      expect(() => uniqueCollection.update(doc)).not.toThrow();
    });

    it('should enforce unique constraint on update (different document)', () => {
      uniqueCollection.insert({ name: 'John', age: 30, email: 'john@test.com' });
      const doc2 = uniqueCollection.insert({ name: 'Jane', age: 25, email: 'jane@test.com' });

      doc2.email = 'john@test.com';

      expect(() => uniqueCollection.update(doc2)).toThrow(/Unique constraint violation/);
    });

    it('should find by unique field', () => {
      uniqueCollection.insert({ name: 'John', age: 30, email: 'john@test.com' });

      const found = uniqueCollection.by('email', 'john@test.com');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('John');
    });

    it('should return null for non-existent unique value', () => {
      uniqueCollection.insert({ name: 'John', age: 30, email: 'john@test.com' });

      const found = uniqueCollection.by('email', 'nobody@test.com');
      expect(found).toBeNull();
    });

    it('should throw error for non-unique field lookup', () => {
      expect(() => uniqueCollection.by('name', 'John')).toThrow(
        "Field 'name' is not a unique index"
      );
    });
  });

  // ============================================================================
  // Binary Indices
  // ============================================================================

  describe('binary indices', () => {
    let indexedCollection: Collection<TestDoc>;

    beforeEach(() => {
      indexedCollection = db.addCollection<TestDoc>('indexed-test', {
        indices: ['age'],
      });
    });

    it('should create index on specified field', () => {
      expect(indexedCollection.binaryIndices['age']).toBeDefined();
    });

    it('should maintain index on insert', () => {
      indexedCollection.insert([
        { name: 'Bob', age: 35 },
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ]);

      const index = indexedCollection.binaryIndices['age'];
      expect(index).toBeDefined();
      expect(index!.values).toHaveLength(3);
    });

    it('should create index with ensureIndex', () => {
      collection.ensureIndex('age');
      expect(collection.binaryIndices['age']).toBeDefined();
    });

    it('should not recreate existing index', () => {
      collection.ensureIndex('age');
      const firstIndex = collection.binaryIndices['age'];
      collection.ensureIndex('age');
      const secondIndex = collection.binaryIndices['age'];

      expect(firstIndex).toBe(secondIndex);
    });

    it('should force recreate index', () => {
      collection.insert({ name: 'John', age: 30 });
      collection.ensureIndex('age');
      const firstIndex = collection.binaryIndices['age'];

      collection.ensureIndex('age', true);
      const secondIndex = collection.binaryIndices['age'];

      expect(secondIndex).toBeDefined();
      expect(secondIndex!.dirty).toBe(false);
    });
  });

  // ============================================================================
  // Count
  // ============================================================================

  describe('count', () => {
    it('should return total count without query', () => {
      collection.insert([
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
        { name: 'Bob', age: 35 },
      ]);

      expect(collection.count()).toBe(3);
    });

    it('should return filtered count with query', () => {
      collection.insert([
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
        { name: 'Bob', age: 35 },
      ]);

      expect(collection.count({ age: { $gt: 25 } })).toBe(2);
    });

    it('should return 0 for empty collection', () => {
      expect(collection.count()).toBe(0);
    });
  });

  // ============================================================================
  // Chain (ResultSet)
  // ============================================================================

  describe('chain', () => {
    it('should return a ResultSet', () => {
      const rs = collection.chain();
      expect(rs).toBeDefined();
      expect(typeof rs.find).toBe('function');
      expect(typeof rs.data).toBe('function');
    });

    it('should allow chained operations', () => {
      collection.insert([
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
        { name: 'Bob', age: 35 },
      ]);

      const results = collection
        .chain()
        .find({ age: { $gte: 25 } })
        .simplesort('age')
        .limit(2)
        .data();

      expect(results).toHaveLength(2);
      expect(results[0]!.age).toBe(25);
      expect(results[1]!.age).toBe(30);
    });
  });

  // ============================================================================
  // Transforms
  // ============================================================================

  describe('transforms', () => {
    beforeEach(() => {
      collection.insert([
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
        { name: 'Bob', age: 35 },
      ]);
    });

    it('should add and execute transform', () => {
      collection.addTransform('adults', [
        { type: 'find', value: { age: { $gte: 30 } } },
        { type: 'simplesort', property: 'age', desc: false },
      ]);

      const results = collection.transform('adults') as any[];
      expect(results).toHaveLength(2);
      expect(results[0].age).toBe(30);
      expect(results[1].age).toBe(35);
    });

    it('should throw error for duplicate transform name', () => {
      collection.addTransform('test', [{ type: 'find', value: {} }]);

      expect(() =>
        collection.addTransform('test', [{ type: 'find', value: {} }])
      ).toThrow("Transform 'test' already exists");
    });

    it('should throw error for non-existent transform', () => {
      expect(() => collection.transform('nonexistent')).toThrow(
        "Transform 'nonexistent' not found"
      );
    });

    it('should remove transform', () => {
      collection.addTransform('test', [{ type: 'find', value: {} }]);
      collection.removeTransform('test');

      expect(() => collection.transform('test')).toThrow();
    });
  });

  // ============================================================================
  // Dynamic Views
  // ============================================================================

  describe('dynamic views', () => {
    it('should add dynamic view', () => {
      const dv = collection.addDynamicView('test-view');
      expect(dv).toBeDefined();
      expect(dv.name).toBe('test-view');
    });

    it('should get dynamic view', () => {
      collection.addDynamicView('test-view');
      const dv = collection.getDynamicView('test-view');

      expect(dv).not.toBeNull();
      expect(dv!.name).toBe('test-view');
    });

    it('should return null for non-existent view', () => {
      const dv = collection.getDynamicView('nonexistent');
      expect(dv).toBeNull();
    });

    it('should throw error for duplicate view name', () => {
      collection.addDynamicView('test-view');

      expect(() => collection.addDynamicView('test-view')).toThrow(
        "DynamicView 'test-view' already exists"
      );
    });

    it('should remove dynamic view', () => {
      collection.addDynamicView('test-view');
      collection.removeDynamicView('test-view');

      expect(collection.getDynamicView('test-view')).toBeNull();
    });

    it('should update dynamic view on insert', () => {
      const dv = collection.addDynamicView('active');
      dv.applyFind({ active: true });

      collection.insert({ name: 'John', age: 30, active: true });
      collection.insert({ name: 'Jane', age: 25, active: false });

      expect(dv.count()).toBe(1);
    });
  });

  // ============================================================================
  // Changes API
  // ============================================================================

  describe('changes API', () => {
    let changesCollection: Collection<TestDoc>;

    beforeEach(() => {
      changesCollection = db.addCollection<TestDoc>('changes-test', {
        disableChangesApi: false,
      });
    });

    it('should track insert changes', () => {
      changesCollection.insert({ name: 'John', age: 30 });
      const changes = changesCollection.flushChanges();

      expect(changes).toHaveLength(1);
      expect(changes[0]!.operation).toBe('I');
    });

    it('should track update changes', () => {
      const doc = changesCollection.insert({ name: 'John', age: 30 });
      changesCollection.flushChanges(); // Clear insert

      doc.age = 31;
      changesCollection.update(doc);
      const changes = changesCollection.flushChanges();

      expect(changes).toHaveLength(1);
      expect(changes[0]!.operation).toBe('U');
    });

    it('should track remove changes', () => {
      const doc = changesCollection.insert({ name: 'John', age: 30 });
      changesCollection.flushChanges(); // Clear insert

      changesCollection.remove(doc);
      const changes = changesCollection.flushChanges();

      expect(changes).toHaveLength(1);
      expect(changes[0]!.operation).toBe('R');
    });

    it('should clear changes on flush', () => {
      changesCollection.insert({ name: 'John', age: 30 });
      changesCollection.flushChanges();
      const changes = changesCollection.flushChanges();

      expect(changes).toHaveLength(0);
    });
  });

  // ============================================================================
  // TTL (Time To Live)
  // ============================================================================

  describe('TTL', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should set TTL configuration', () => {
      const ttlCollection = db.addCollection<TestDoc>('ttl-test', {
        ttl: 1000,
        ttlInterval: 500,
      });

      expect(ttlCollection.ttl.age).toBe(1000);
      expect(ttlCollection.ttl.ttlInterval).toBe(500);
    });

    it('should setup TTL daemon', () => {
      const ttlCollection = db.addCollection<TestDoc>('ttl-test', {
        ttl: 1000,
        ttlInterval: 500,
      });

      expect(ttlCollection.ttl.daemon).not.toBeNull();
    });
  });

  // ============================================================================
  // Serialization
  // ============================================================================

  describe('serialization', () => {
    it('should serialize collection', () => {
      collection.insert([
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ]);

      const serialized = collection.serialize();

      expect(serialized.name).toBe('test');
      expect(serialized.data).toHaveLength(2);
      expect(serialized.maxId).toBe(2);
    });

    it('should deserialize collection', () => {
      collection.insert([
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ]);

      const serialized = collection.serialize();
      const restored = Collection.deserialize<TestDoc>(serialized);

      expect(restored.name).toBe('test');
      expect(restored.count()).toBe(2);
      expect(restored.findOne({ name: 'John' })).not.toBeNull();
    });

    it('should restore unique indices after deserialize', () => {
      const uniqueCollection = db.addCollection<TestDoc>('unique-test', {
        unique: ['email'],
      });
      uniqueCollection.insert({ name: 'John', age: 30, email: 'john@test.com' });

      const serialized = uniqueCollection.serialize();
      const restored = Collection.deserialize<TestDoc>(serialized);

      const found = restored.by('email', 'john@test.com');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('John');
    });

    it('should serialize and restore dynamic views', () => {
      collection.insert({ name: 'John', age: 30, active: true });
      const dv = collection.addDynamicView('active');
      dv.applyFind({ active: true });

      const serialized = collection.serialize();
      const restored = Collection.deserialize<TestDoc>(serialized);
      const restoredDv = restored.getDynamicView('active');

      expect(restoredDv).not.toBeNull();
      expect(restoredDv!.name).toBe('active');
    });
  });
});
