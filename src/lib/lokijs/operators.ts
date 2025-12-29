/**
 * LokiJS Modernized - Query Operators
 * Comprehensive set of comparison and logical operators
 */

import type { Query, QueryOperators } from './types.js';

export type OperatorFunction = (a: unknown, b: unknown) => boolean;

// Comparison operators
export const operators: Record<string, OperatorFunction> = {
  $eq: (a, b) => a === b,

  $ne: (a, b) => a !== b,

  $gt: (a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return a > b;
    if (typeof a === 'string' && typeof b === 'string') return a > b;
    if (a instanceof Date && b instanceof Date) return a.getTime() > b.getTime();
    return false;
  },

  $gte: (a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return a >= b;
    if (typeof a === 'string' && typeof b === 'string') return a >= b;
    if (a instanceof Date && b instanceof Date) return a.getTime() >= b.getTime();
    return false;
  },

  $lt: (a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return a < b;
    if (typeof a === 'string' && typeof b === 'string') return a < b;
    if (a instanceof Date && b instanceof Date) return a.getTime() < b.getTime();
    return false;
  },

  $lte: (a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return a <= b;
    if (typeof a === 'string' && typeof b === 'string') return a <= b;
    if (a instanceof Date && b instanceof Date) return a.getTime() <= b.getTime();
    return false;
  },

  $in: (a, b) => {
    if (!Array.isArray(b)) return false;
    return b.includes(a);
  },

  $nin: (a, b) => {
    if (!Array.isArray(b)) return true;
    return !b.includes(a);
  },

  $between: (a, b) => {
    if (!Array.isArray(b) || b.length !== 2) return false;
    const [min, max] = b;
    if (typeof a === 'number' && typeof min === 'number' && typeof max === 'number') {
      return a >= min && a <= max;
    }
    return false;
  },

  $regex: (a, b) => {
    if (typeof a !== 'string') return false;
    const regex = b instanceof RegExp ? b : new RegExp(b as string);
    return regex.test(a);
  },

  $contains: (a, b) => {
    if (Array.isArray(a)) return a.includes(b);
    if (typeof a === 'string' && typeof b === 'string') return a.includes(b);
    return false;
  },

  $containsAny: (a, b) => {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    return b.some(item => a.includes(item));
  },

  $containsNone: (a, b) => {
    if (!Array.isArray(a) || !Array.isArray(b)) return true;
    return !b.some(item => a.includes(item));
  },

  $type: (a, b) => {
    if (b === 'array') return Array.isArray(a);
    if (b === 'null') return a === null;
    if (b === 'date') return a instanceof Date;
    return typeof a === b;
  },

  $finite: (a, b) => {
    if (typeof a !== 'number') return !b;
    return b ? Number.isFinite(a) : !Number.isFinite(a);
  },

  $size: (a, b) => {
    if (!Array.isArray(a) || typeof b !== 'number') return false;
    return a.length === b;
  },

  $len: (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'number') return false;
    return a.length === b;
  },

  $exists: (a, b) => {
    const exists = a !== undefined && a !== null;
    return b ? exists : !exists;
  },
};

// Check if a value is a query operator object
export function isQueryOperator(value: unknown): value is QueryOperators {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every(key => key.startsWith('$'));
}

// Check if a key is an operator
export function isOperatorKey(key: string): boolean {
  return key.startsWith('$');
}

// Evaluate a single operator
export function evaluateOperator(
  fieldValue: unknown,
  operator: string,
  operatorValue: unknown
): boolean {
  const op = operators[operator];
  if (!op) {
    throw new Error(`Unknown operator: ${operator}`);
  }
  return op(fieldValue, operatorValue);
}

// Evaluate a query operators object against a field value
export function evaluateOperators(
  fieldValue: unknown,
  queryOps: QueryOperators
): boolean {
  for (const [operator, operatorValue] of Object.entries(queryOps)) {
    if (!evaluateOperator(fieldValue, operator, operatorValue)) {
      return false;
    }
  }
  return true;
}

// Get a nested property value using dot notation
export function getNestedProperty(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// Main document matching function
export function matchesQuery<T extends object>(
  doc: T,
  query: Query<T>
): boolean {
  for (const [key, condition] of Object.entries(query)) {
    // Handle logical operators
    if (key === '$and') {
      const conditions = condition as Query<T>[];
      if (!conditions.every(q => matchesQuery(doc, q))) {
        return false;
      }
      continue;
    }

    if (key === '$or') {
      const conditions = condition as Query<T>[];
      if (!conditions.some(q => matchesQuery(doc, q))) {
        return false;
      }
      continue;
    }

    if (key === '$not') {
      if (matchesQuery(doc, condition as Query<T>)) {
        return false;
      }
      continue;
    }

    // Get field value (supports dot notation)
    const fieldValue = getNestedProperty(doc, key);

    // Handle $elemMatch for array fields
    if (isQueryOperator(condition) && '$elemMatch' in condition) {
      if (!Array.isArray(fieldValue)) {
        return false;
      }
      const elemQuery = condition.$elemMatch as Query<unknown>;
      if (!fieldValue.some(elem =>
        typeof elem === 'object' && elem !== null
          ? matchesQuery(elem as object, elemQuery as Query<object>)
          : false
      )) {
        return false;
      }
      continue;
    }

    // Direct value comparison or operator evaluation
    if (isQueryOperator(condition)) {
      if (!evaluateOperators(fieldValue, condition)) {
        return false;
      }
    } else {
      // Direct equality check
      if (fieldValue !== condition) {
        return false;
      }
    }
  }

  return true;
}

// Create a comparator function for sorting
export function createComparator<T>(
  property: keyof T,
  desc = false
): (a: T, b: T) => number {
  return (a: T, b: T): number => {
    const aVal = a[property];
    const bVal = b[property];

    let result: number;

    if (aVal === bVal) {
      result = 0;
    } else if (aVal === null || aVal === undefined) {
      result = 1;
    } else if (bVal === null || bVal === undefined) {
      result = -1;
    } else if (typeof aVal === 'string' && typeof bVal === 'string') {
      result = aVal.localeCompare(bVal);
    } else if (aVal < bVal) {
      result = -1;
    } else {
      result = 1;
    }

    return desc ? -result : result;
  };
}

// Create a compound comparator for multi-field sorting
export function createCompoundComparator<T>(
  criteria: Array<[keyof T, boolean]>
): (a: T, b: T) => number {
  const comparators = criteria.map(([prop, desc]) =>
    createComparator(prop, desc)
  );

  return (a: T, b: T): number => {
    for (const comparator of comparators) {
      const result = comparator(a, b);
      if (result !== 0) return result;
    }
    return 0;
  };
}
