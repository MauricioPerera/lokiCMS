/**
 * LokiJS Operators Tests
 * Tests for query operators and matching functions
 */

import { describe, it, expect } from 'vitest';
import {
  operators,
  isQueryOperator,
  isOperatorKey,
  evaluateOperator,
  evaluateOperators,
  getNestedProperty,
  matchesQuery,
  createComparator,
  createCompoundComparator,
} from '../../../lib/lokijs/operators.js';

describe('LokiJS Operators', () => {
  // ============================================================================
  // Comparison Operators
  // ============================================================================

  describe('$eq operator', () => {
    it('should match equal values', () => {
      expect(operators.$eq(5, 5)).toBe(true);
      expect(operators.$eq('hello', 'hello')).toBe(true);
      expect(operators.$eq(true, true)).toBe(true);
      expect(operators.$eq(null, null)).toBe(true);
    });

    it('should not match unequal values', () => {
      expect(operators.$eq(5, 10)).toBe(false);
      expect(operators.$eq('hello', 'world')).toBe(false);
      expect(operators.$eq(true, false)).toBe(false);
      expect(operators.$eq(null, undefined)).toBe(false);
    });

    it('should use strict equality', () => {
      expect(operators.$eq(5, '5')).toBe(false);
      expect(operators.$eq(0, false)).toBe(false);
      expect(operators.$eq('', false)).toBe(false);
    });
  });

  describe('$ne operator', () => {
    it('should match unequal values', () => {
      expect(operators.$ne(5, 10)).toBe(true);
      expect(operators.$ne('hello', 'world')).toBe(true);
      expect(operators.$ne(true, false)).toBe(true);
    });

    it('should not match equal values', () => {
      expect(operators.$ne(5, 5)).toBe(false);
      expect(operators.$ne('hello', 'hello')).toBe(false);
    });
  });

  describe('$gt operator', () => {
    it('should compare numbers correctly', () => {
      expect(operators.$gt(10, 5)).toBe(true);
      expect(operators.$gt(5, 10)).toBe(false);
      expect(operators.$gt(5, 5)).toBe(false);
    });

    it('should compare strings correctly', () => {
      expect(operators.$gt('b', 'a')).toBe(true);
      expect(operators.$gt('a', 'b')).toBe(false);
      expect(operators.$gt('abc', 'abc')).toBe(false);
    });

    it('should compare dates correctly', () => {
      const earlier = new Date('2023-01-01');
      const later = new Date('2023-12-31');
      expect(operators.$gt(later, earlier)).toBe(true);
      expect(operators.$gt(earlier, later)).toBe(false);
    });

    it('should return false for incompatible types', () => {
      expect(operators.$gt('10', 5)).toBe(false);
      expect(operators.$gt(null, 5)).toBe(false);
      expect(operators.$gt(undefined, 5)).toBe(false);
    });
  });

  describe('$gte operator', () => {
    it('should compare numbers correctly', () => {
      expect(operators.$gte(10, 5)).toBe(true);
      expect(operators.$gte(5, 5)).toBe(true);
      expect(operators.$gte(5, 10)).toBe(false);
    });

    it('should compare strings correctly', () => {
      expect(operators.$gte('b', 'a')).toBe(true);
      expect(operators.$gte('a', 'a')).toBe(true);
      expect(operators.$gte('a', 'b')).toBe(false);
    });

    it('should compare dates correctly', () => {
      const date = new Date('2023-06-15');
      const sameDate = new Date('2023-06-15');
      expect(operators.$gte(date, sameDate)).toBe(true);
    });
  });

  describe('$lt operator', () => {
    it('should compare numbers correctly', () => {
      expect(operators.$lt(5, 10)).toBe(true);
      expect(operators.$lt(10, 5)).toBe(false);
      expect(operators.$lt(5, 5)).toBe(false);
    });

    it('should compare strings correctly', () => {
      expect(operators.$lt('a', 'b')).toBe(true);
      expect(operators.$lt('b', 'a')).toBe(false);
    });

    it('should compare dates correctly', () => {
      const earlier = new Date('2023-01-01');
      const later = new Date('2023-12-31');
      expect(operators.$lt(earlier, later)).toBe(true);
      expect(operators.$lt(later, earlier)).toBe(false);
    });
  });

  describe('$lte operator', () => {
    it('should compare numbers correctly', () => {
      expect(operators.$lte(5, 10)).toBe(true);
      expect(operators.$lte(5, 5)).toBe(true);
      expect(operators.$lte(10, 5)).toBe(false);
    });

    it('should compare strings correctly', () => {
      expect(operators.$lte('a', 'b')).toBe(true);
      expect(operators.$lte('a', 'a')).toBe(true);
    });
  });

  // ============================================================================
  // Membership Operators
  // ============================================================================

  describe('$in operator', () => {
    it('should return true if value is in array', () => {
      expect(operators.$in(5, [1, 2, 3, 4, 5])).toBe(true);
      expect(operators.$in('a', ['a', 'b', 'c'])).toBe(true);
    });

    it('should return false if value is not in array', () => {
      expect(operators.$in(6, [1, 2, 3, 4, 5])).toBe(false);
      expect(operators.$in('d', ['a', 'b', 'c'])).toBe(false);
    });

    it('should return false if not array', () => {
      expect(operators.$in(5, 'not an array' as unknown as unknown[])).toBe(false);
      expect(operators.$in(5, null as unknown as unknown[])).toBe(false);
    });

    it('should handle empty array', () => {
      expect(operators.$in(5, [])).toBe(false);
    });
  });

  describe('$nin operator', () => {
    it('should return true if value is not in array', () => {
      expect(operators.$nin(6, [1, 2, 3, 4, 5])).toBe(true);
      expect(operators.$nin('d', ['a', 'b', 'c'])).toBe(true);
    });

    it('should return false if value is in array', () => {
      expect(operators.$nin(5, [1, 2, 3, 4, 5])).toBe(false);
      expect(operators.$nin('a', ['a', 'b', 'c'])).toBe(false);
    });

    it('should return true if not array', () => {
      expect(operators.$nin(5, 'not an array' as unknown as unknown[])).toBe(true);
    });

    it('should handle empty array', () => {
      expect(operators.$nin(5, [])).toBe(true);
    });
  });

  describe('$between operator', () => {
    it('should return true if value is within range (inclusive)', () => {
      expect(operators.$between(5, [1, 10])).toBe(true);
      expect(operators.$between(1, [1, 10])).toBe(true); // lower boundary
      expect(operators.$between(10, [1, 10])).toBe(true); // upper boundary
    });

    it('should return false if value is outside range', () => {
      expect(operators.$between(0, [1, 10])).toBe(false);
      expect(operators.$between(11, [1, 10])).toBe(false);
    });

    it('should return false for invalid range format', () => {
      expect(operators.$between(5, [1])).toBe(false); // missing upper bound
      expect(operators.$between(5, [1, 2, 3])).toBe(false); // too many elements
      expect(operators.$between(5, 'not array' as unknown as unknown[])).toBe(false);
    });

    it('should return false for non-numeric values', () => {
      expect(operators.$between('5', [1, 10])).toBe(false);
      expect(operators.$between(5, ['1', '10'])).toBe(false);
    });
  });

  // ============================================================================
  // String/Pattern Operators
  // ============================================================================

  describe('$regex operator', () => {
    it('should match with RegExp object', () => {
      expect(operators.$regex('hello world', /world/)).toBe(true);
      expect(operators.$regex('hello world', /WORLD/i)).toBe(true);
      expect(operators.$regex('hello', /world/)).toBe(false);
    });

    it('should match with string pattern', () => {
      expect(operators.$regex('hello world', 'world')).toBe(true);
      expect(operators.$regex('test@email.com', '@')).toBe(true);
    });

    it('should return false for non-string values', () => {
      expect(operators.$regex(123, /123/)).toBe(false);
      expect(operators.$regex(null, /null/)).toBe(false);
      expect(operators.$regex(['hello'], /hello/)).toBe(false);
    });

    it('should handle complex patterns', () => {
      expect(operators.$regex('user@example.com', /^[\w.-]+@[\w.-]+\.\w+$/)).toBe(true);
      expect(operators.$regex('2023-12-25', /^\d{4}-\d{2}-\d{2}$/)).toBe(true);
    });
  });

  describe('$contains operator', () => {
    it('should check array membership', () => {
      expect(operators.$contains([1, 2, 3], 2)).toBe(true);
      expect(operators.$contains(['a', 'b', 'c'], 'b')).toBe(true);
      expect(operators.$contains([1, 2, 3], 5)).toBe(false);
    });

    it('should check string substring', () => {
      expect(operators.$contains('hello world', 'world')).toBe(true);
      expect(operators.$contains('hello world', 'foo')).toBe(false);
    });

    it('should return false for incompatible types', () => {
      expect(operators.$contains(123, 2)).toBe(false);
      expect(operators.$contains(null, 'a')).toBe(false);
    });
  });

  describe('$containsAny operator', () => {
    it('should return true if any element matches', () => {
      expect(operators.$containsAny([1, 2, 3], [3, 4, 5])).toBe(true);
      expect(operators.$containsAny(['a', 'b'], ['b', 'c'])).toBe(true);
    });

    it('should return false if no elements match', () => {
      expect(operators.$containsAny([1, 2, 3], [4, 5, 6])).toBe(false);
    });

    it('should return false for non-arrays', () => {
      expect(operators.$containsAny('abc', ['a'])).toBe(false);
      expect(operators.$containsAny([1, 2], 'not array' as unknown as unknown[])).toBe(false);
    });

    it('should handle empty arrays', () => {
      expect(operators.$containsAny([1, 2], [])).toBe(false);
      expect(operators.$containsAny([], [1, 2])).toBe(false);
    });
  });

  describe('$containsNone operator', () => {
    it('should return true if no elements match', () => {
      expect(operators.$containsNone([1, 2, 3], [4, 5, 6])).toBe(true);
    });

    it('should return false if any element matches', () => {
      expect(operators.$containsNone([1, 2, 3], [3, 4, 5])).toBe(false);
    });

    it('should return true for non-arrays', () => {
      expect(operators.$containsNone('abc', ['a'])).toBe(true);
    });
  });

  describe('$len operator', () => {
    it('should match string length', () => {
      expect(operators.$len('hello', 5)).toBe(true);
      expect(operators.$len('hello', 3)).toBe(false);
      expect(operators.$len('', 0)).toBe(true);
    });

    it('should return false for non-strings', () => {
      expect(operators.$len(12345, 5)).toBe(false);
      expect(operators.$len(['a', 'b'], 2)).toBe(false);
    });

    it('should return false for non-number length', () => {
      expect(operators.$len('hello', '5' as unknown as number)).toBe(false);
    });
  });

  // ============================================================================
  // Type/Array Operators
  // ============================================================================

  describe('$type operator', () => {
    it('should check for array type', () => {
      expect(operators.$type([1, 2, 3], 'array')).toBe(true);
      expect(operators.$type('not array', 'array')).toBe(false);
    });

    it('should check for null', () => {
      expect(operators.$type(null, 'null')).toBe(true);
      expect(operators.$type(undefined, 'null')).toBe(false);
    });

    it('should check for date', () => {
      expect(operators.$type(new Date(), 'date')).toBe(true);
      expect(operators.$type('2023-01-01', 'date')).toBe(false);
    });

    it('should check for primitive types', () => {
      expect(operators.$type('hello', 'string')).toBe(true);
      expect(operators.$type(123, 'number')).toBe(true);
      expect(operators.$type(true, 'boolean')).toBe(true);
      expect(operators.$type({}, 'object')).toBe(true);
      expect(operators.$type(undefined, 'undefined')).toBe(true);
    });
  });

  describe('$finite operator', () => {
    it('should return true for finite numbers when b is true', () => {
      expect(operators.$finite(123, true)).toBe(true);
      expect(operators.$finite(0, true)).toBe(true);
      expect(operators.$finite(-123.456, true)).toBe(true);
    });

    it('should return false for infinite numbers when b is true', () => {
      expect(operators.$finite(Infinity, true)).toBe(false);
      expect(operators.$finite(-Infinity, true)).toBe(false);
      expect(operators.$finite(NaN, true)).toBe(false);
    });

    it('should return true for infinite numbers when b is false', () => {
      expect(operators.$finite(Infinity, false)).toBe(true);
      expect(operators.$finite(NaN, false)).toBe(true);
    });

    it('should handle non-numbers', () => {
      expect(operators.$finite('123', true)).toBe(false);
      expect(operators.$finite('123', false)).toBe(true);
    });
  });

  describe('$size operator', () => {
    it('should match array length', () => {
      expect(operators.$size([1, 2, 3], 3)).toBe(true);
      expect(operators.$size([], 0)).toBe(true);
      expect(operators.$size([1, 2, 3], 5)).toBe(false);
    });

    it('should return false for non-arrays', () => {
      expect(operators.$size('hello', 5)).toBe(false);
      expect(operators.$size({ length: 5 }, 5)).toBe(false);
    });
  });

  describe('$exists operator', () => {
    it('should check for existence', () => {
      expect(operators.$exists('value', true)).toBe(true);
      expect(operators.$exists(0, true)).toBe(true);
      expect(operators.$exists(false, true)).toBe(true);
      expect(operators.$exists('', true)).toBe(true);
    });

    it('should detect non-existence', () => {
      expect(operators.$exists(null, true)).toBe(false);
      expect(operators.$exists(undefined, true)).toBe(false);
    });

    it('should invert with false parameter', () => {
      expect(operators.$exists(null, false)).toBe(true);
      expect(operators.$exists(undefined, false)).toBe(true);
      expect(operators.$exists('value', false)).toBe(false);
    });
  });

  // ============================================================================
  // Helper Functions
  // ============================================================================

  describe('isQueryOperator', () => {
    it('should detect query operator objects', () => {
      expect(isQueryOperator({ $eq: 5 })).toBe(true);
      expect(isQueryOperator({ $gt: 10, $lt: 20 })).toBe(true);
    });

    it('should reject non-operator objects', () => {
      expect(isQueryOperator({ name: 'test' })).toBe(false);
      expect(isQueryOperator({ $eq: 5, name: 'test' })).toBe(false);
    });

    it('should reject primitives and special values', () => {
      expect(isQueryOperator(null)).toBe(false);
      expect(isQueryOperator(undefined)).toBe(false);
      expect(isQueryOperator(123)).toBe(false);
      expect(isQueryOperator('string')).toBe(false);
      expect(isQueryOperator([1, 2, 3])).toBe(false);
    });

    it('should reject empty objects', () => {
      expect(isQueryOperator({})).toBe(false);
    });
  });

  describe('isOperatorKey', () => {
    it('should identify operator keys', () => {
      expect(isOperatorKey('$eq')).toBe(true);
      expect(isOperatorKey('$gt')).toBe(true);
      expect(isOperatorKey('$and')).toBe(true);
    });

    it('should reject non-operator keys', () => {
      expect(isOperatorKey('name')).toBe(false);
      expect(isOperatorKey('field')).toBe(false);
      expect(isOperatorKey('')).toBe(false);
    });
  });

  describe('evaluateOperator', () => {
    it('should evaluate known operators', () => {
      expect(evaluateOperator(5, '$eq', 5)).toBe(true);
      expect(evaluateOperator(10, '$gt', 5)).toBe(true);
    });

    it('should throw for unknown operators', () => {
      expect(() => evaluateOperator(5, '$unknown', 5)).toThrow('Unknown operator: $unknown');
    });
  });

  describe('evaluateOperators', () => {
    it('should evaluate multiple operators (AND logic)', () => {
      expect(evaluateOperators(15, { $gt: 10, $lt: 20 })).toBe(true);
      expect(evaluateOperators(5, { $gt: 10, $lt: 20 })).toBe(false);
      expect(evaluateOperators(25, { $gt: 10, $lt: 20 })).toBe(false);
    });

    it('should handle single operator', () => {
      expect(evaluateOperators(5, { $eq: 5 })).toBe(true);
    });
  });

  describe('getNestedProperty', () => {
    it('should get top-level properties', () => {
      expect(getNestedProperty({ name: 'test' }, 'name')).toBe('test');
    });

    it('should get nested properties', () => {
      const obj = { user: { profile: { name: 'John' } } };
      expect(getNestedProperty(obj, 'user.profile.name')).toBe('John');
    });

    it('should return undefined for missing paths', () => {
      const obj = { name: 'test' };
      expect(getNestedProperty(obj, 'missing')).toBe(undefined);
      expect(getNestedProperty(obj, 'a.b.c')).toBe(undefined);
    });

    it('should handle null/undefined objects', () => {
      expect(getNestedProperty(null, 'name')).toBe(undefined);
      expect(getNestedProperty(undefined, 'name')).toBe(undefined);
    });

    it('should handle non-object values in path', () => {
      const obj = { name: 'test' };
      expect(getNestedProperty(obj, 'name.length')).toBe(undefined);
    });
  });

  // ============================================================================
  // matchesQuery - Main Matching Function
  // ============================================================================

  describe('matchesQuery', () => {
    interface TestDoc {
      name: string;
      age: number;
      active: boolean;
      tags: string[];
      profile?: { city: string };
    }

    const doc: TestDoc = {
      name: 'John',
      age: 30,
      active: true,
      tags: ['developer', 'nodejs'],
      profile: { city: 'NYC' },
    };

    describe('direct equality', () => {
      it('should match exact values', () => {
        expect(matchesQuery(doc, { name: 'John' })).toBe(true);
        expect(matchesQuery(doc, { age: 30 })).toBe(true);
        expect(matchesQuery(doc, { active: true })).toBe(true);
      });

      it('should not match different values', () => {
        expect(matchesQuery(doc, { name: 'Jane' })).toBe(false);
        expect(matchesQuery(doc, { age: 25 })).toBe(false);
      });

      it('should match multiple fields (AND)', () => {
        expect(matchesQuery(doc, { name: 'John', age: 30 })).toBe(true);
        expect(matchesQuery(doc, { name: 'John', age: 25 })).toBe(false);
      });
    });

    describe('operators in query', () => {
      it('should handle comparison operators', () => {
        expect(matchesQuery(doc, { age: { $gt: 25 } })).toBe(true);
        expect(matchesQuery(doc, { age: { $lt: 25 } })).toBe(false);
        expect(matchesQuery(doc, { age: { $gte: 30, $lte: 30 } })).toBe(true);
      });

      it('should handle membership operators', () => {
        expect(matchesQuery(doc, { name: { $in: ['John', 'Jane'] } })).toBe(true);
        expect(matchesQuery(doc, { name: { $nin: ['Bob', 'Alice'] } })).toBe(true);
      });

      it('should handle array operators', () => {
        expect(matchesQuery(doc, { tags: { $contains: 'developer' } })).toBe(true);
        expect(matchesQuery(doc, { tags: { $size: 2 } })).toBe(true);
      });
    });

    describe('nested properties', () => {
      it('should access nested properties with dot notation', () => {
        expect(matchesQuery(doc, { 'profile.city': 'NYC' } as Query<TestDoc>)).toBe(true);
        expect(matchesQuery(doc, { 'profile.city': { $eq: 'NYC' } } as Query<TestDoc>)).toBe(true);
      });
    });

    describe('logical operators', () => {
      it('should handle $and', () => {
        expect(
          matchesQuery(doc, {
            $and: [{ name: 'John' }, { age: { $gte: 25 } }],
          })
        ).toBe(true);
        expect(
          matchesQuery(doc, {
            $and: [{ name: 'John' }, { age: { $lt: 25 } }],
          })
        ).toBe(false);
      });

      it('should handle $or', () => {
        expect(
          matchesQuery(doc, {
            $or: [{ name: 'Jane' }, { age: 30 }],
          })
        ).toBe(true);
        expect(
          matchesQuery(doc, {
            $or: [{ name: 'Jane' }, { age: 25 }],
          })
        ).toBe(false);
      });

      it('should handle $not', () => {
        expect(matchesQuery(doc, { $not: { name: 'Jane' } })).toBe(true);
        expect(matchesQuery(doc, { $not: { name: 'John' } })).toBe(false);
      });

      it('should handle nested logical operators', () => {
        expect(
          matchesQuery(doc, {
            $and: [
              { $or: [{ name: 'John' }, { name: 'Jane' }] },
              { age: { $gte: 25 } },
            ],
          })
        ).toBe(true);
      });
    });

    describe('$elemMatch', () => {
      interface DocWithObjects {
        items: Array<{ name: string; value: number }>;
      }

      const docWithObjects: DocWithObjects = {
        items: [
          { name: 'a', value: 10 },
          { name: 'b', value: 20 },
        ],
      };

      it('should match array element with nested query', () => {
        expect(
          matchesQuery(docWithObjects, {
            items: { $elemMatch: { name: 'a', value: { $gte: 5 } } },
          } as Query<DocWithObjects>)
        ).toBe(true);
      });

      it('should not match if no element matches all conditions', () => {
        expect(
          matchesQuery(docWithObjects, {
            items: { $elemMatch: { name: 'a', value: { $gt: 15 } } },
          } as Query<DocWithObjects>)
        ).toBe(false);
      });

      it('should return false if field is not an array', () => {
        const nonArrayDoc = { items: 'not an array' };
        expect(
          matchesQuery(nonArrayDoc, {
            items: { $elemMatch: { name: 'a' } },
          } as Query<typeof nonArrayDoc>)
        ).toBe(false);
      });
    });

    describe('empty query', () => {
      it('should match all documents with empty query', () => {
        expect(matchesQuery(doc, {})).toBe(true);
      });
    });
  });

  // ============================================================================
  // Comparators for Sorting
  // ============================================================================

  describe('createComparator', () => {
    interface SortDoc {
      name: string;
      age: number;
      date: Date | null;
    }

    const docs: SortDoc[] = [
      { name: 'Charlie', age: 30, date: new Date('2023-03-01') },
      { name: 'Alice', age: 25, date: new Date('2023-01-01') },
      { name: 'Bob', age: 35, date: null },
    ];

    it('should sort by string property ascending', () => {
      const sorted = [...docs].sort(createComparator<SortDoc>('name'));
      expect(sorted.map(d => d.name)).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('should sort by string property descending', () => {
      const sorted = [...docs].sort(createComparator<SortDoc>('name', true));
      expect(sorted.map(d => d.name)).toEqual(['Charlie', 'Bob', 'Alice']);
    });

    it('should sort by number property', () => {
      const sorted = [...docs].sort(createComparator<SortDoc>('age'));
      expect(sorted.map(d => d.age)).toEqual([25, 30, 35]);
    });

    it('should handle null values (sort to end)', () => {
      const sorted = [...docs].sort(createComparator<SortDoc>('date'));
      expect(sorted[sorted.length - 1].date).toBe(null);
    });
  });

  describe('createCompoundComparator', () => {
    interface CompoundDoc {
      category: string;
      priority: number;
      name: string;
    }

    const docs: CompoundDoc[] = [
      { category: 'A', priority: 2, name: 'Item 1' },
      { category: 'B', priority: 1, name: 'Item 2' },
      { category: 'A', priority: 1, name: 'Item 3' },
      { category: 'A', priority: 2, name: 'Item 4' },
    ];

    it('should sort by multiple fields', () => {
      const sorted = [...docs].sort(
        createCompoundComparator<CompoundDoc>([
          ['category', false],
          ['priority', false],
        ])
      );

      expect(sorted.map(d => d.name)).toEqual(['Item 3', 'Item 1', 'Item 4', 'Item 2']);
    });

    it('should handle mixed sort directions', () => {
      const sorted = [...docs].sort(
        createCompoundComparator<CompoundDoc>([
          ['category', false], // ascending
          ['priority', true],  // descending
        ])
      );

      expect(sorted[0].category).toBe('A');
      expect(sorted[0].priority).toBe(2);
    });
  });
});

// Type helper for tests
type Query<T> = Record<string, unknown>;
