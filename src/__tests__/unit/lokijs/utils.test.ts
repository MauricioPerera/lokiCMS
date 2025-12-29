/**
 * LokiJS Utils Tests
 * Tests for utility functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateId,
  cloneDeep,
  cloneShallow,
  cloneShallowAssign,
  cloneShallowRecurse,
  clone,
  deepFreeze,
  unFreeze,
  hasOwn,
  isPlainObject,
  binarySearch,
  calculateHash,
  isValidLokiId,
  stripLokiMetadata,
  addLokiMetadata,
  updateMetadata,
  debounce,
  throttle,
  isLokiDocument,
  safeJsonParse,
} from '../../../lib/lokijs/utils.js';

describe('LokiJS Utils', () => {
  // ============================================================================
  // ID Generation
  // ============================================================================

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    it('should generate string IDs', () => {
      const id = generateId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should contain expected format with hyphens', () => {
      const id = generateId();
      expect(id).toMatch(/-/);
    });
  });

  // ============================================================================
  // Clone Functions
  // ============================================================================

  describe('cloneDeep', () => {
    it('should deep clone objects', () => {
      const obj = { a: 1, b: { c: 2 } };
      const cloned = cloneDeep(obj);

      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
      expect(cloned.b).not.toBe(obj.b);
    });

    it('should deep clone arrays', () => {
      const arr = [1, [2, 3], { a: 4 }];
      const cloned = cloneDeep(arr);

      expect(cloned).toEqual(arr);
      expect(cloned).not.toBe(arr);
      expect(cloned[1]).not.toBe(arr[1]);
    });

    it('should handle null and primitives', () => {
      expect(cloneDeep(null)).toBe(null);
      expect(cloneDeep(5)).toBe(5);
      expect(cloneDeep('string')).toBe('string');
    });
  });

  describe('cloneShallow', () => {
    it('should shallow clone objects', () => {
      const nested = { c: 2 };
      const obj = { a: 1, b: nested };
      const cloned = cloneShallow(obj);

      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
      expect(cloned.b).toBe(obj.b); // Same reference
    });

    it('should shallow clone arrays', () => {
      const nested = [2, 3];
      const arr = [1, nested];
      const cloned = cloneShallow(arr);

      expect(cloned).toEqual(arr);
      expect(cloned).not.toBe(arr);
      expect(cloned[1]).toBe(arr[1]); // Same reference
    });
  });

  describe('cloneShallowAssign', () => {
    it('should shallow clone using Object.assign', () => {
      const obj = { a: 1, b: { c: 2 } };
      const cloned = cloneShallowAssign(obj);

      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
      expect(cloned.b).toBe(obj.b); // Same reference
    });

    it('should work with arrays', () => {
      const arr = [1, 2, 3];
      const cloned = cloneShallowAssign(arr);

      expect(cloned).toEqual(arr);
      expect(cloned).not.toBe(arr);
    });
  });

  describe('cloneShallowRecurse', () => {
    it('should clone with specified depth', () => {
      const obj = { a: { b: { c: 1 } } };
      const cloned = cloneShallowRecurse(obj, 1);

      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
      expect(cloned.a).not.toBe(obj.a);
      expect(cloned.a.b).toBe(obj.a.b); // Same reference at depth 2
    });

    it('should handle arrays', () => {
      const arr = [[1, 2], [3, 4]];
      const cloned = cloneShallowRecurse(arr, 1);

      expect(cloned).toEqual(arr);
      expect(cloned).not.toBe(arr);
    });

    it('should handle Date objects', () => {
      const date = new Date('2023-06-15');
      const cloned = cloneShallowRecurse(date);

      expect(cloned).toEqual(date);
      expect(cloned).not.toBe(date);
    });

    it('should handle primitives', () => {
      expect(cloneShallowRecurse(null)).toBe(null);
      expect(cloneShallowRecurse(5)).toBe(5);
      expect(cloneShallowRecurse('string')).toBe('string');
    });
  });

  describe('clone', () => {
    const obj = { a: 1, b: { c: 2 } };

    it('should use parse-stringify by default', () => {
      const cloned = clone(obj);
      expect(cloned).toEqual(obj);
      expect(cloned.b).not.toBe(obj.b);
    });

    it('should respect clone method parameter', () => {
      const shallow = clone(obj, 'shallow');
      expect(shallow.b).toBe(obj.b);

      const deep = clone(obj, 'parse-stringify');
      expect(deep.b).not.toBe(obj.b);
    });

    it('should handle all clone methods', () => {
      expect(() => clone(obj, 'shallow')).not.toThrow();
      expect(() => clone(obj, 'shallow-assign')).not.toThrow();
      expect(() => clone(obj, 'shallow-recurse-objects')).not.toThrow();
      expect(() => clone(obj, 'parse-stringify')).not.toThrow();
    });
  });

  // ============================================================================
  // Object Utilities
  // ============================================================================

  describe('deepFreeze', () => {
    it('should freeze object deeply', () => {
      const obj = { a: 1, b: { c: 2 } };
      const frozen = deepFreeze(obj);

      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.b)).toBe(true);
    });

    it('should prevent modifications', () => {
      const obj = { a: 1 };
      const frozen = deepFreeze(obj);

      expect(() => {
        (frozen as { a: number }).a = 2;
      }).toThrow();
    });
  });

  describe('unFreeze', () => {
    it('should create unfrozen clone', () => {
      const obj = { a: 1 };
      const frozen = deepFreeze(obj);
      const unfrozen = unFreeze(frozen);

      expect(Object.isFrozen(unfrozen)).toBe(false);
      unfrozen.a = 2;
      expect(unfrozen.a).toBe(2);
    });
  });

  describe('hasOwn', () => {
    it('should return true for own properties', () => {
      const obj = { name: 'test' };
      expect(hasOwn(obj, 'name')).toBe(true);
    });

    it('should return false for inherited properties', () => {
      const obj = { name: 'test' };
      expect(hasOwn(obj, 'toString')).toBe(false);
    });

    it('should return false for missing properties', () => {
      const obj = { name: 'test' };
      expect(hasOwn(obj, 'missing')).toBe(false);
    });
  });

  describe('isPlainObject', () => {
    it('should return true for plain objects', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1 })).toBe(true);
      expect(isPlainObject(Object.create(null))).toBe(true);
    });

    it('should return false for non-plain objects', () => {
      expect(isPlainObject(null)).toBe(false);
      expect(isPlainObject(undefined)).toBe(false);
      expect(isPlainObject([1, 2, 3])).toBe(false);
      expect(isPlainObject(new Date())).toBe(false);
      expect(isPlainObject('string')).toBe(false);
      expect(isPlainObject(123)).toBe(false);
    });
  });

  // ============================================================================
  // Binary Search
  // ============================================================================

  describe('binarySearch', () => {
    const numComparator = (a: number, b: number) => a - b;

    it('should find existing elements', () => {
      const arr = [1, 3, 5, 7, 9];
      const result = binarySearch(arr, 5, numComparator);

      expect(result.found).toBe(true);
      expect(result.index).toBe(2);
    });

    it('should return insertion point for missing elements', () => {
      const arr = [1, 3, 5, 7, 9];
      const result = binarySearch(arr, 4, numComparator);

      expect(result.found).toBe(false);
      expect(result.index).toBe(2); // Should be inserted at index 2
    });

    it('should handle empty arrays', () => {
      const result = binarySearch([], 5, numComparator);

      expect(result.found).toBe(false);
      expect(result.index).toBe(0);
    });

    it('should handle first and last elements', () => {
      const arr = [1, 3, 5, 7, 9];

      expect(binarySearch(arr, 1, numComparator).found).toBe(true);
      expect(binarySearch(arr, 9, numComparator).found).toBe(true);
    });

    it('should handle values outside range', () => {
      const arr = [1, 3, 5, 7, 9];

      const before = binarySearch(arr, 0, numComparator);
      expect(before.found).toBe(false);
      expect(before.index).toBe(0);

      const after = binarySearch(arr, 10, numComparator);
      expect(after.found).toBe(false);
      expect(after.index).toBe(5);
    });
  });

  // ============================================================================
  // Hash and Validation
  // ============================================================================

  describe('calculateHash', () => {
    it('should hash primitives', () => {
      expect(calculateHash(123)).toBe('123');
      expect(calculateHash('hello')).toBe('hello');
      expect(calculateHash(true)).toBe('true');
    });

    it('should handle null and undefined', () => {
      expect(calculateHash(null)).toBe('null');
      expect(calculateHash(undefined)).toBe('undefined');
    });

    it('should hash objects as JSON', () => {
      const obj = { a: 1, b: 2 };
      expect(calculateHash(obj)).toBe(JSON.stringify(obj));
    });
  });

  describe('isValidLokiId', () => {
    it('should accept valid IDs', () => {
      expect(isValidLokiId(1)).toBe(true);
      expect(isValidLokiId(100)).toBe(true);
      expect(isValidLokiId(999999)).toBe(true);
    });

    it('should reject invalid IDs', () => {
      expect(isValidLokiId(0)).toBe(false);
      expect(isValidLokiId(-1)).toBe(false);
      expect(isValidLokiId(1.5)).toBe(false);
      expect(isValidLokiId('1')).toBe(false);
      expect(isValidLokiId(null)).toBe(false);
      expect(isValidLokiId(undefined)).toBe(false);
    });
  });

  // ============================================================================
  // Metadata Operations
  // ============================================================================

  describe('stripLokiMetadata', () => {
    it('should remove $loki and meta', () => {
      const doc = {
        $loki: 1,
        meta: { created: 123, revision: 0 },
        name: 'test',
        value: 42,
      };

      const stripped = stripLokiMetadata(doc);

      expect(stripped).toEqual({ name: 'test', value: 42 });
      expect('$loki' in stripped).toBe(false);
      expect('meta' in stripped).toBe(false);
    });
  });

  describe('addLokiMetadata', () => {
    it('should add $loki and meta', () => {
      const doc = { name: 'test', value: 42 };
      const withMeta = addLokiMetadata(doc, 1, 1000);

      expect(withMeta.$loki).toBe(1);
      expect(withMeta.meta.created).toBe(1000);
      expect(withMeta.meta.revision).toBe(0);
      expect(withMeta.name).toBe('test');
    });

    it('should use current time if not provided', () => {
      const doc = { name: 'test' };
      const before = Date.now();
      const withMeta = addLokiMetadata(doc, 1);
      const after = Date.now();

      expect(withMeta.meta.created).toBeGreaterThanOrEqual(before);
      expect(withMeta.meta.created).toBeLessThanOrEqual(after);
    });
  });

  describe('updateMetadata', () => {
    it('should increment revision and set updated', () => {
      const doc = {
        $loki: 1,
        meta: { created: 1000, revision: 0 },
        name: 'test',
      };

      const before = Date.now();
      const updated = updateMetadata(doc);
      const after = Date.now();

      expect(updated.meta.revision).toBe(1);
      expect(updated.meta.updated).toBeGreaterThanOrEqual(before);
      expect(updated.meta.updated).toBeLessThanOrEqual(after);
      expect(updated.meta.created).toBe(1000); // Unchanged
    });

    it('should preserve other metadata', () => {
      const doc = {
        $loki: 1,
        meta: { created: 1000, revision: 5 },
        name: 'test',
      };

      const updated = updateMetadata(doc);
      expect(updated.meta.revision).toBe(6);
    });
  });

  // ============================================================================
  // Type Guards
  // ============================================================================

  describe('isLokiDocument', () => {
    it('should return true for valid Loki documents', () => {
      const doc = {
        $loki: 1,
        meta: { created: 1000, revision: 0 },
        name: 'test',
      };

      expect(isLokiDocument(doc)).toBe(true);
    });

    it('should return false for invalid documents', () => {
      expect(isLokiDocument(null)).toBe(false);
      expect(isLokiDocument(undefined)).toBe(false);
      expect(isLokiDocument({ name: 'test' })).toBe(false);
      expect(isLokiDocument({ $loki: 1 })).toBe(false);
      expect(isLokiDocument({ meta: {} })).toBe(false);
      expect(isLokiDocument({ $loki: '1', meta: {} })).toBe(false);
    });
  });

  // ============================================================================
  // Debounce and Throttle
  // ============================================================================

  describe('debounce', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should delay function execution', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should reset timer on subsequent calls', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      vi.advanceTimersByTime(50);
      debounced();
      vi.advanceTimersByTime(50);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments to debounced function', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced('arg1', 'arg2');
      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('throttle', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should execute immediately on first call', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should ignore calls during throttle period', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      throttled();
      throttled();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should allow calls after throttle period', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      vi.advanceTimersByTime(100);
      throttled();

      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================================
  // Safe JSON Parse
  // ============================================================================

  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      const result = safeJsonParse('{"a": 1}');
      expect(result).toEqual({ a: 1 });
    });

    it('should return null for invalid JSON', () => {
      const result = safeJsonParse('invalid json');
      expect(result).toBe(null);
    });

    it('should validate with custom validator', () => {
      const validator = (data: unknown): data is { type: string } =>
        typeof data === 'object' &&
        data !== null &&
        'type' in data &&
        typeof (data as { type: unknown }).type === 'string';

      const valid = safeJsonParse('{"type": "test"}', validator);
      expect(valid).toEqual({ type: 'test' });

      const invalid = safeJsonParse('{"value": 123}', validator);
      expect(invalid).toBe(null);
    });

    it('should handle various JSON types', () => {
      expect(safeJsonParse('[1, 2, 3]')).toEqual([1, 2, 3]);
      expect(safeJsonParse('"string"')).toBe('string');
      expect(safeJsonParse('123')).toBe(123);
      expect(safeJsonParse('null')).toBe(null);
    });
  });
});
