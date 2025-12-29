/**
 * LokiJS Adapters Tests
 * Tests for persistence adapters
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryAdapter, Loki } from '../../../lib/lokijs/index.js';

describe('LokiJS Adapters', () => {
  // ============================================================================
  // MemoryAdapter
  // ============================================================================

  describe('MemoryAdapter', () => {
    let adapter: MemoryAdapter;

    beforeEach(() => {
      adapter = new MemoryAdapter();
    });

    describe('saveDatabase', () => {
      it('should save data to memory', async () => {
        const data = JSON.stringify({ test: 'data' });
        await adapter.saveDatabase('test.db', data);

        // Verify by loading
        const loaded = await adapter.loadDatabase('test.db');
        expect(loaded).toBe(data);
      });

      it('should overwrite existing data', async () => {
        await adapter.saveDatabase('test.db', 'first');
        await adapter.saveDatabase('test.db', 'second');

        const loaded = await adapter.loadDatabase('test.db');
        expect(loaded).toBe('second');
      });
    });

    describe('loadDatabase', () => {
      it('should return null for non-existent database', async () => {
        const data = await adapter.loadDatabase('nonexistent.db');
        expect(data).toBeNull();
      });

      it('should return saved data', async () => {
        const testData = JSON.stringify({ key: 'value' });
        await adapter.saveDatabase('test.db', testData);

        const loaded = await adapter.loadDatabase('test.db');
        expect(loaded).toBe(testData);
      });
    });

    describe('deleteDatabase', () => {
      it('should delete saved database', async () => {
        await adapter.saveDatabase('test.db', 'data');
        await adapter.deleteDatabase('test.db');

        const loaded = await adapter.loadDatabase('test.db');
        expect(loaded).toBeNull();
      });

      it('should not throw for non-existent database', async () => {
        await expect(adapter.deleteDatabase('nonexistent.db')).resolves.not.toThrow();
      });
    });

    describe('isolation', () => {
      it('should isolate different databases', async () => {
        await adapter.saveDatabase('db1.json', 'data1');
        await adapter.saveDatabase('db2.json', 'data2');

        expect(await adapter.loadDatabase('db1.json')).toBe('data1');
        expect(await adapter.loadDatabase('db2.json')).toBe('data2');
      });
    });
  });

  // ============================================================================
  // Integration with Loki
  // ============================================================================

  describe('Adapter Integration', () => {
    describe('MemoryAdapter with Loki', () => {
      let db: Loki;
      let adapter: MemoryAdapter;

      beforeEach(() => {
        adapter = new MemoryAdapter();
        db = new Loki('test.db', { adapter });
      });

      afterEach(async () => {
        await db.close();
      });

      it('should persist through save/load cycle', async () => {
        const col = db.addCollection('users');
        col.insert({ name: 'Alice', age: 30 });

        await db.save();

        // Create new database with same adapter
        const db2 = new Loki('test.db', { adapter });
        await db2.load();

        const col2 = db2.getCollection('users');
        expect(col2).not.toBeNull();
        expect(col2!.count()).toBe(1);
        expect(col2!.findOne({ name: 'Alice' })).not.toBeNull();

        await db2.close();
      });

      it('should handle empty database', async () => {
        await db.load();
        expect(db.listCollections()).toHaveLength(0);
      });

      it('should handle multiple collections', async () => {
        const users = db.addCollection('users');
        const posts = db.addCollection('posts');

        users.insert({ name: 'Alice' });
        posts.insert({ title: 'Hello World' });

        await db.save();

        const db2 = new Loki('test.db', { adapter });
        await db2.load();

        expect(db2.listCollections()).toHaveLength(2);
        expect(db2.getCollection('users')!.count()).toBe(1);
        expect(db2.getCollection('posts')!.count()).toBe(1);

        await db2.close();
      });
    });
  });

  // ============================================================================
  // Multiple Databases
  // ============================================================================

  describe('Multiple Databases', () => {
    let adapter: MemoryAdapter;

    beforeEach(() => {
      adapter = new MemoryAdapter();
    });

    it('should handle multiple databases independently', async () => {
      const db1 = new Loki('db1.json', { adapter });
      const db2 = new Loki('db2.json', { adapter });

      const col1 = db1.addCollection('test');
      const col2 = db2.addCollection('test');

      col1.insert({ id: 1 });
      col2.insert({ id: 2 });
      col2.insert({ id: 3 });

      await db1.save();
      await db2.save();

      // Reload
      const db1Reload = new Loki('db1.json', { adapter });
      const db2Reload = new Loki('db2.json', { adapter });

      await db1Reload.load();
      await db2Reload.load();

      expect(db1Reload.getCollection('test')!.count()).toBe(1);
      expect(db2Reload.getCollection('test')!.count()).toBe(2);

      await db1.close();
      await db2.close();
      await db1Reload.close();
      await db2Reload.close();
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    let adapter: MemoryAdapter;

    beforeEach(() => {
      adapter = new MemoryAdapter();
    });

    it('should handle large data', async () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        data: 'x'.repeat(100),
      }));

      const data = JSON.stringify({ items: largeArray });
      await adapter.saveDatabase('large.db', data);

      const loaded = await adapter.loadDatabase('large.db');
      const parsed = JSON.parse(loaded!);

      expect(parsed.items).toHaveLength(1000);
    });

    it('should handle special characters in data', async () => {
      const data = JSON.stringify({
        text: 'Hello\nWorld\t"quoted"',
        unicode: '日本語',
        emoji: '🎉',
      });

      await adapter.saveDatabase('special.db', data);
      const loaded = await adapter.loadDatabase('special.db');

      expect(loaded).toBe(data);
    });

    it('should handle empty string data', async () => {
      await adapter.saveDatabase('empty.db', '');
      const loaded = await adapter.loadDatabase('empty.db');

      expect(loaded).toBe('');
    });
  });

  // ============================================================================
  // Async Behavior
  // ============================================================================

  describe('Async Behavior', () => {
    let adapter: MemoryAdapter;

    beforeEach(() => {
      adapter = new MemoryAdapter();
    });

    it('should handle concurrent saves', async () => {
      const saves = [
        adapter.saveDatabase('test.db', 'data1'),
        adapter.saveDatabase('test.db', 'data2'),
        adapter.saveDatabase('test.db', 'data3'),
      ];

      await Promise.all(saves);

      // Last write wins
      const loaded = await adapter.loadDatabase('test.db');
      expect(['data1', 'data2', 'data3']).toContain(loaded);
    });

    it('should handle save while loading', async () => {
      await adapter.saveDatabase('test.db', 'original');

      const loadPromise = adapter.loadDatabase('test.db');
      await adapter.saveDatabase('test.db', 'updated');

      const loaded = await loadPromise;
      // Should get original or updated depending on timing
      expect(['original', 'updated']).toContain(loaded);
    });
  });
});
