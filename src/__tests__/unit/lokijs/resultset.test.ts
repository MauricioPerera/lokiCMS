/**
 * LokiJS ResultSet Tests
 * Tests for chainable query interface
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Loki, MemoryAdapter, Collection } from '../../../lib/lokijs/index.js';

interface TestDoc {
  name: string;
  age: number;
  active?: boolean;
  category?: string;
  score?: number;
}

describe('LokiJS ResultSet', () => {
  let db: Loki;
  let collection: Collection<TestDoc>;

  beforeEach(() => {
    db = new Loki('test.db', { adapter: new MemoryAdapter() });
    collection = db.addCollection<TestDoc>('test');

    // Insert test data
    collection.insert([
      { name: 'Alice', age: 25, active: true, category: 'A', score: 85 },
      { name: 'Bob', age: 30, active: true, category: 'B', score: 92 },
      { name: 'Charlie', age: 35, active: false, category: 'A', score: 78 },
      { name: 'Diana', age: 28, active: true, category: 'B', score: 88 },
      { name: 'Eve', age: 22, active: false, category: 'C', score: 95 },
    ]);
  });

  afterEach(async () => {
    await db.close();
  });

  // ============================================================================
  // Basic Operations
  // ============================================================================

  describe('chain', () => {
    it('should create a new ResultSet', () => {
      const rs = collection.chain();
      expect(rs).toBeDefined();
    });

    it('should return all documents without filters', () => {
      const results = collection.chain().data();
      expect(results).toHaveLength(5);
    });
  });

  describe('data', () => {
    it('should return array of documents', () => {
      const results = collection.chain().data();
      expect(Array.isArray(results)).toBe(true);
      expect(results[0]).toHaveProperty('$loki');
      expect(results[0]).toHaveProperty('meta');
    });

    it('should clone documents when forceClones is true', () => {
      const results = collection.chain().data({ forceClones: true });
      const doc = results[0]!;
      doc.name = 'Modified';

      const original = collection.findOne({ age: 25 });
      expect(original!.name).toBe('Alice');
    });

    it('should remove meta when removeMeta is true', () => {
      const results = collection.chain().data({ removeMeta: true });
      expect(results[0]).not.toHaveProperty('meta');
    });
  });

  describe('count', () => {
    it('should return count without materializing', () => {
      const count = collection.chain().count();
      expect(count).toBe(5);
    });

    it('should return filtered count', () => {
      const count = collection.chain().find({ active: true }).count();
      expect(count).toBe(3);
    });
  });

  // ============================================================================
  // Filtering
  // ============================================================================

  describe('find', () => {
    it('should filter by simple equality', () => {
      const results = collection.chain().find({ name: 'Alice' }).data();
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });

    it('should filter by comparison operators', () => {
      const results = collection.chain().find({ age: { $gt: 28 } }).data();
      expect(results).toHaveLength(2);
    });

    it('should support multiple filters (AND)', () => {
      const results = collection
        .chain()
        .find({ active: true })
        .find({ age: { $lt: 30 } })
        .data();
      expect(results).toHaveLength(2);
    });

    it('should return all with empty query', () => {
      const results = collection.chain().find({}).data();
      expect(results).toHaveLength(5);
    });

    it('should handle $in operator', () => {
      const results = collection.chain().find({ category: { $in: ['A', 'B'] } }).data();
      expect(results).toHaveLength(4);
    });
  });

  describe('where', () => {
    it('should filter by custom function', () => {
      const results = collection
        .chain()
        .where(doc => doc.age > 25)
        .data();
      expect(results).toHaveLength(3);
    });

    it('should chain with find', () => {
      const results = collection
        .chain()
        .find({ active: true })
        .where(doc => doc.score! > 85)
        .data();
      expect(results).toHaveLength(2);
    });
  });

  // ============================================================================
  // Sorting
  // ============================================================================

  describe('simplesort', () => {
    it('should sort ascending by default', () => {
      const results = collection.chain().simplesort('age').data();
      expect(results[0]!.age).toBe(22);
      expect(results[4]!.age).toBe(35);
    });

    it('should sort descending when specified', () => {
      const results = collection.chain().simplesort('age', true).data();
      expect(results[0]!.age).toBe(35);
      expect(results[4]!.age).toBe(22);
    });

    it('should sort strings alphabetically', () => {
      const results = collection.chain().simplesort('name').data();
      expect(results[0]!.name).toBe('Alice');
      expect(results[4]!.name).toBe('Eve');
    });

    it('should accept options object', () => {
      const results = collection.chain().simplesort('age', { desc: true }).data();
      expect(results[0]!.age).toBe(35);
    });
  });

  describe('compoundsort', () => {
    it('should sort by multiple fields', () => {
      const results = collection
        .chain()
        .compoundsort([['category', false], ['age', false]])
        .data();

      // Category A first, sorted by age
      expect(results[0]!.category).toBe('A');
      expect(results[0]!.age).toBe(25);
      expect(results[1]!.category).toBe('A');
      expect(results[1]!.age).toBe(35);
    });

    it('should handle mixed sort directions', () => {
      const results = collection
        .chain()
        .compoundsort([['category', false], ['age', true]])
        .data();

      // Category A, age descending
      expect(results[0]!.age).toBe(35);
      expect(results[1]!.age).toBe(25);
    });
  });

  describe('sort', () => {
    it('should sort with custom comparator', () => {
      const results = collection
        .chain()
        .sort((a, b) => b.score! - a.score!)
        .data();

      expect(results[0]!.score).toBe(95);
      expect(results[4]!.score).toBe(78);
    });
  });

  // ============================================================================
  // Pagination
  // ============================================================================

  describe('limit', () => {
    it('should limit results', () => {
      const results = collection.chain().limit(2).data();
      expect(results).toHaveLength(2);
    });

    it('should work with sorting', () => {
      const results = collection
        .chain()
        .simplesort('score', true)
        .limit(3)
        .data();

      expect(results).toHaveLength(3);
      expect(results[0]!.score).toBe(95);
    });

    it('should handle limit larger than data', () => {
      const results = collection.chain().limit(100).data();
      expect(results).toHaveLength(5);
    });
  });

  describe('offset', () => {
    it('should skip results', () => {
      const results = collection.chain().simplesort('age').offset(2).data();
      expect(results).toHaveLength(3);
      expect(results[0]!.age).toBe(28);
    });

    it('should work with limit', () => {
      const results = collection
        .chain()
        .simplesort('age')
        .offset(1)
        .limit(2)
        .data();

      expect(results).toHaveLength(2);
      expect(results[0]!.age).toBe(25);
      expect(results[1]!.age).toBe(28);
    });

    it('should handle offset beyond data length', () => {
      const results = collection.chain().offset(100).data();
      expect(results).toHaveLength(0);
    });
  });

  // ============================================================================
  // Transformations
  // ============================================================================

  describe('map', () => {
    it('should transform documents', () => {
      const names = collection.chain().map(doc => doc.name);
      expect(names).toContain('Alice');
      expect(names).toHaveLength(5);
    });

    it('should work with filtered results', () => {
      const ages = collection
        .chain()
        .find({ active: true })
        .map(doc => doc.age);

      expect(ages).toHaveLength(3);
    });
  });

  describe('reduce', () => {
    it('should reduce documents', () => {
      const totalAge = collection
        .chain()
        .reduce((sum, doc) => sum + doc.age, 0);

      expect(totalAge).toBe(25 + 30 + 35 + 28 + 22);
    });

    it('should work with filtered results', () => {
      const avgScore = collection
        .chain()
        .find({ active: true })
        .reduce((acc, doc, _, arr) => {
          acc.sum += doc.score!;
          acc.count++;
          return acc;
        }, { sum: 0, count: 0 });

      expect(avgScore.sum / avgScore.count).toBeCloseTo(88.33, 1);
    });
  });

  // ============================================================================
  // First/Last
  // ============================================================================

  describe('first', () => {
    it('should return first document', () => {
      const doc = collection.chain().simplesort('age').first();
      expect(doc!.age).toBe(22);
    });

    it('should return null for empty results', () => {
      const doc = collection.chain().find({ name: 'Nobody' }).first();
      expect(doc).toBeNull();
    });
  });

  describe('last', () => {
    it('should return last document', () => {
      const doc = collection.chain().simplesort('age').last();
      expect(doc!.age).toBe(35);
    });

    it('should return null for empty results', () => {
      const doc = collection.chain().find({ name: 'Nobody' }).last();
      expect(doc).toBeNull();
    });
  });

  // ============================================================================
  // Mutations
  // ============================================================================

  describe('update', () => {
    it('should update matched documents', () => {
      collection
        .chain()
        .find({ active: false })
        .update(doc => {
          doc.active = true;
          return doc;
        });

      const allActive = collection.find({ active: false });
      expect(allActive).toHaveLength(0);
    });
  });

  describe('remove', () => {
    it('should remove matched documents', () => {
      collection.chain().find({ active: false }).remove();

      expect(collection.count()).toBe(3);
      expect(collection.find({ active: false })).toHaveLength(0);
    });
  });

  // ============================================================================
  // Copy/Branch
  // ============================================================================

  describe('copy', () => {
    it('should create independent copy', () => {
      const rs1 = collection.chain().find({ active: true });
      const rs2 = rs1.copy().find({ age: { $gt: 25 } });

      expect(rs1.count()).toBe(3);
      expect(rs2.count()).toBe(2);
    });
  });

  describe('branch', () => {
    it('should be alias for copy', () => {
      const rs1 = collection.chain().find({ active: true });
      const rs2 = rs1.branch().limit(1);

      expect(rs1.count()).toBe(3);
      expect(rs2.count()).toBe(1);
    });
  });

  // ============================================================================
  // Join
  // ============================================================================

  describe('eqJoin', () => {
    let ordersCollection: Collection<{ userId: number; product: string }>;

    beforeEach(() => {
      ordersCollection = db.addCollection('orders');
      ordersCollection.insert([
        { userId: 1, product: 'Widget' },
        { userId: 2, product: 'Gadget' },
        { userId: 1, product: 'Thingamajig' },
      ]);
    });

    it('should join with another collection', () => {
      // Create users with numeric IDs
      const usersCollection = db.addCollection<{ userId: number; name: string }>('users');
      usersCollection.insert([
        { userId: 1, name: 'User1' },
        { userId: 2, name: 'User2' },
      ]);

      const results = ordersCollection
        .chain()
        .eqJoin(usersCollection, 'userId', 'userId');

      expect(results).toHaveLength(3);
      expect(results[0]).toHaveProperty('left');
      expect(results[0]).toHaveProperty('right');
    });

    it('should join with array data', () => {
      const userData = [
        { $loki: 1, meta: { created: 0, revision: 0 }, userId: 1, name: 'User1' },
        { $loki: 2, meta: { created: 0, revision: 0 }, userId: 2, name: 'User2' },
      ];

      const results = ordersCollection
        .chain()
        .eqJoin(userData as any, 'userId', 'userId');

      expect(results).toHaveLength(3);
    });

    it('should use custom map function', () => {
      const usersCollection = db.addCollection<{ userId: number; name: string }>('users2');
      usersCollection.insert([
        { userId: 1, name: 'User1' },
        { userId: 2, name: 'User2' },
      ]);

      const results = ordersCollection
        .chain()
        .eqJoin(
          usersCollection,
          'userId',
          'userId',
          (order, user) => ({
            product: order.product,
            userName: user?.name ?? 'Unknown',
          })
        );

      expect(results[0]).toHaveProperty('product');
      expect(results[0]).toHaveProperty('userName');
    });

    it('should handle null right documents (outer join behavior)', () => {
      ordersCollection.insert({ userId: 999, product: 'Orphan' });

      const usersCollection = db.addCollection<{ userId: number; name: string }>('users3');
      usersCollection.insert([
        { userId: 1, name: 'User1' },
      ]);

      const results = ordersCollection
        .chain()
        .eqJoin(usersCollection, 'userId', 'userId');

      const orphan = results.find(r => (r as any).left.userId === 999);
      expect((orphan as any).right).toBeNull();
    });
  });

  // ============================================================================
  // Reset
  // ============================================================================

  describe('reset', () => {
    it('should reset filters', () => {
      const rs = collection.chain().find({ active: true });
      expect(rs.count()).toBe(3);

      rs.reset();
      expect(rs.count()).toBe(5);
    });
  });

  // ============================================================================
  // Complex Chains
  // ============================================================================

  describe('complex chains', () => {
    it('should handle multiple operations', () => {
      const results = collection
        .chain()
        .find({ active: true })
        .where(doc => doc.age >= 25)
        .simplesort('score', true)
        .limit(2)
        .data();

      expect(results).toHaveLength(2);
      expect(results[0]!.score).toBe(92);
      expect(results[1]!.score).toBe(88);
    });

    it('should support pagination pattern', () => {
      const page = 2;
      const pageSize = 2;

      const results = collection
        .chain()
        .simplesort('name')
        .offset((page - 1) * pageSize)
        .limit(pageSize)
        .data();

      expect(results).toHaveLength(2);
      expect(results[0]!.name).toBe('Charlie');
      expect(results[1]!.name).toBe('Diana');
    });
  });
});
