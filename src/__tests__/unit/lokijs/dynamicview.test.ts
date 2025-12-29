/**
 * LokiJS DynamicView Tests
 * Tests for persistent filtered views with automatic updates
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Loki, MemoryAdapter, Collection } from '../../../lib/lokijs/index.js';

interface TestDoc {
  name: string;
  age: number;
  active?: boolean;
  category?: string;
}

describe('LokiJS DynamicView', () => {
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
  // Creation
  // ============================================================================

  describe('creation', () => {
    it('should create a dynamic view', () => {
      const dv = collection.addDynamicView('test-view');
      expect(dv).toBeDefined();
      expect(dv.name).toBe('test-view');
    });

    it('should create persistent view when option is set', () => {
      const dv = collection.addDynamicView('persistent-view', { persistent: true });
      expect(dv.options.persistent).toBe(true);
    });

    it('should be retrievable by name', () => {
      collection.addDynamicView('my-view');
      const dv = collection.getDynamicView('my-view');
      expect(dv).not.toBeNull();
      expect(dv!.name).toBe('my-view');
    });
  });

  // ============================================================================
  // Filters
  // ============================================================================

  describe('applyFind', () => {
    beforeEach(() => {
      collection.insert([
        { name: 'Alice', age: 25, active: true },
        { name: 'Bob', age: 30, active: false },
        { name: 'Charlie', age: 35, active: true },
      ]);
    });

    it('should filter documents', () => {
      const dv = collection.addDynamicView('active');
      dv.applyFind({ active: true });

      expect(dv.count()).toBe(2);
    });

    it('should support operator queries', () => {
      const dv = collection.addDynamicView('young');
      dv.applyFind({ age: { $lt: 30 } });

      expect(dv.count()).toBe(1);
      expect(dv.data()[0]!.name).toBe('Alice');
    });

    it('should support filter with UID', () => {
      const dv = collection.addDynamicView('test');
      dv.applyFind({ active: true }, 'filter1');

      expect(dv.count()).toBe(2);
    });

    it('should stack multiple find filters (AND)', () => {
      const dv = collection.addDynamicView('test');
      dv.applyFind({ active: true });
      dv.applyFind({ age: { $gte: 30 } });

      expect(dv.count()).toBe(1);
      expect(dv.data()[0]!.name).toBe('Charlie');
    });
  });

  describe('applyWhere', () => {
    beforeEach(() => {
      collection.insert([
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 30 },
        { name: 'Charlie', age: 35 },
      ]);
    });

    it('should filter with custom function', () => {
      const dv = collection.addDynamicView('custom');
      dv.applyWhere(doc => doc.age > 28);

      expect(dv.count()).toBe(2);
    });

    it('should combine with find filters', () => {
      const dv = collection.addDynamicView('combo');
      dv.applyFind({ age: { $gte: 25 } });
      dv.applyWhere(doc => doc.name.startsWith('A') || doc.name.startsWith('C'));

      expect(dv.count()).toBe(2);
    });
  });

  describe('removeFilter', () => {
    beforeEach(() => {
      collection.insert([
        { name: 'Alice', age: 25, active: true },
        { name: 'Bob', age: 30, active: false },
      ]);
    });

    it('should remove filter by UID', () => {
      const dv = collection.addDynamicView('test', { persistent: true });
      dv.applyFind({ active: true }, 'activeFilter');

      expect(dv.count()).toBe(1);

      dv.removeFilter('activeFilter');
      expect(dv.count()).toBe(2);
    });
  });

  // ============================================================================
  // Sorting
  // ============================================================================

  describe('applySimpleSort', () => {
    beforeEach(() => {
      collection.insert([
        { name: 'Charlie', age: 35 },
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 30 },
      ]);
    });

    it('should sort ascending', () => {
      const dv = collection.addDynamicView('sorted');
      dv.applySimpleSort('age');

      const data = dv.data();
      expect(data[0]!.age).toBe(25);
      expect(data[2]!.age).toBe(35);
    });

    it('should sort descending', () => {
      const dv = collection.addDynamicView('sorted');
      dv.applySimpleSort('age', true);

      const data = dv.data();
      expect(data[0]!.age).toBe(35);
      expect(data[2]!.age).toBe(25);
    });
  });

  describe('applySortCriteria', () => {
    beforeEach(() => {
      collection.insert([
        { name: 'Alice', age: 25, category: 'A' },
        { name: 'Bob', age: 30, category: 'A' },
        { name: 'Charlie', age: 25, category: 'B' },
      ]);
    });

    it('should sort by multiple fields', () => {
      const dv = collection.addDynamicView('multi-sort');
      dv.applySortCriteria([['category', false], ['age', false]]);

      const data = dv.data();
      expect(data[0]!.name).toBe('Alice');
      expect(data[1]!.name).toBe('Bob');
      expect(data[2]!.name).toBe('Charlie');
    });
  });

  describe('applySort', () => {
    beforeEach(() => {
      collection.insert([
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 30 },
      ]);
    });

    it('should apply custom sort function', () => {
      const dv = collection.addDynamicView('custom-sort');
      dv.applySort((a, b) => b.age - a.age);

      const data = dv.data();
      expect(data[0]!.age).toBe(30);
    });
  });

  describe('removeSort', () => {
    it('should remove sorting', () => {
      const dv = collection.addDynamicView('test');
      dv.applySimpleSort('name');
      dv.removeSort();

      expect(dv.sortCriteriaSimple).toBeNull();
      expect(dv.sortFunction).toBeNull();
    });
  });

  // ============================================================================
  // Auto-Update
  // ============================================================================

  describe('auto-update on insert', () => {
    it('should include new matching documents (persistent)', () => {
      const dv = collection.addDynamicView('active', { persistent: true });
      dv.applyFind({ active: true });

      collection.insert({ name: 'Alice', age: 25, active: true });
      expect(dv.count()).toBe(1);

      collection.insert({ name: 'Bob', age: 30, active: true });
      expect(dv.count()).toBe(2);
    });

    it('should exclude non-matching documents', () => {
      const dv = collection.addDynamicView('active', { persistent: true });
      dv.applyFind({ active: true });

      collection.insert({ name: 'Alice', age: 25, active: true });
      collection.insert({ name: 'Bob', age: 30, active: false });

      expect(dv.count()).toBe(1);
    });
  });

  describe('auto-update on update', () => {
    it('should add document when it starts matching', () => {
      collection.insert({ name: 'Alice', age: 25, active: false });

      const dv = collection.addDynamicView('active', { persistent: true });
      dv.applyFind({ active: true });

      expect(dv.count()).toBe(0);

      const doc = collection.findOne({ name: 'Alice' });
      doc!.active = true;
      collection.update(doc!);

      expect(dv.count()).toBe(1);
    });

    it('should remove document when it stops matching', () => {
      collection.insert({ name: 'Alice', age: 25, active: true });

      const dv = collection.addDynamicView('active', { persistent: true });
      dv.applyFind({ active: true });

      expect(dv.count()).toBe(1);

      const doc = collection.findOne({ name: 'Alice' });
      doc!.active = false;
      collection.update(doc!);

      expect(dv.count()).toBe(0);
    });
  });

  describe('auto-update on remove', () => {
    it('should remove deleted documents from view', () => {
      collection.insert([
        { name: 'Alice', age: 25, active: true },
        { name: 'Bob', age: 30, active: true },
      ]);

      const dv = collection.addDynamicView('active', { persistent: true });
      dv.applyFind({ active: true });

      expect(dv.count()).toBe(2);

      const alice = collection.findOne({ name: 'Alice' });
      collection.remove(alice!);

      expect(dv.count()).toBe(1);
    });
  });

  // ============================================================================
  // Data Access
  // ============================================================================

  describe('data', () => {
    beforeEach(() => {
      collection.insert([
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 30 },
      ]);
    });

    it('should return filtered documents', () => {
      const dv = collection.addDynamicView('test');
      dv.applyFind({ age: { $gt: 25 } });

      const data = dv.data();
      expect(data).toHaveLength(1);
      expect(data[0]!.name).toBe('Bob');
    });
  });

  describe('count', () => {
    beforeEach(() => {
      collection.insert([
        { name: 'Alice', age: 25, active: true },
        { name: 'Bob', age: 30, active: false },
        { name: 'Charlie', age: 35, active: true },
      ]);
    });

    it('should return count of matching documents', () => {
      const dv = collection.addDynamicView('active');
      dv.applyFind({ active: true });

      expect(dv.count()).toBe(2);
    });
  });

  describe('branchResultset', () => {
    beforeEach(() => {
      collection.insert([
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 30 },
        { name: 'Charlie', age: 35 },
      ]);
    });

    it('should return independent ResultSet', () => {
      const dv = collection.addDynamicView('test');
      dv.applyFind({ age: { $gte: 25 } });

      const rs = dv.branchResultset();
      const limited = rs.limit(1).data();

      expect(limited).toHaveLength(1);
      expect(dv.count()).toBe(3); // View unaffected
    });
  });

  // ============================================================================
  // Serialization
  // ============================================================================

  describe('serialize', () => {
    it('should serialize view configuration', () => {
      const dv = collection.addDynamicView('test');
      dv.applyFind({ active: true });
      dv.applySimpleSort('age');

      const serialized = dv.serialize();

      expect(serialized.name).toBe('test');
      expect(serialized.filterPipeline).toHaveLength(1);
      expect(serialized.sortCriteriaSimple).toEqual({ field: 'age', desc: false });
    });
  });

  describe('deserialize', () => {
    it('should restore view from serialized data', () => {
      collection.insert([
        { name: 'Alice', age: 25, active: true },
        { name: 'Bob', age: 30, active: false },
      ]);

      const dv = collection.addDynamicView('test', { persistent: true });
      dv.applyFind({ active: true });

      const serialized = dv.serialize();

      // Create new view and deserialize
      const newDv = collection.addDynamicView('test2');
      newDv.deserialize(serialized);

      expect(newDv.count()).toBe(1);
    });
  });

  // ============================================================================
  // Events
  // ============================================================================

  describe('events', () => {
    it('should emit rebuild event', () => {
      const listener = vi.fn();
      const dv = collection.addDynamicView('test', { persistent: true });
      dv.on('rebuild', listener);

      dv.rebuild();

      expect(listener).toHaveBeenCalledWith({ name: 'test' });
    });

    it('should emit filter event on applyFind', () => {
      const listener = vi.fn();
      const dv = collection.addDynamicView('test');
      dv.on('filter', listener);

      dv.applyFind({ active: true });

      expect(listener).toHaveBeenCalledWith({ type: 'find' });
    });

    it('should emit filter event on applyWhere', () => {
      const listener = vi.fn();
      const dv = collection.addDynamicView('test');
      dv.on('filter', listener);

      dv.applyWhere(() => true);

      expect(listener).toHaveBeenCalledWith({ type: 'where' });
    });

    it('should emit sort event', () => {
      const listener = vi.fn();
      const dv = collection.addDynamicView('test');
      dv.on('sort', listener);

      dv.applySimpleSort('age');

      expect(listener).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Collection Integration
  // ============================================================================

  describe('collection integration', () => {
    it('should be removed from collection', () => {
      collection.addDynamicView('test');
      expect(collection.getDynamicView('test')).not.toBeNull();

      collection.removeDynamicView('test');
      expect(collection.getDynamicView('test')).toBeNull();
    });

    it('should rebuild on collection clear', () => {
      collection.insert([
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 30 },
      ]);

      const dv = collection.addDynamicView('test', { persistent: true });
      expect(dv.count()).toBe(2);

      collection.clear();
      expect(dv.count()).toBe(0);
    });
  });
});
