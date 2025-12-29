/**
 * LokiJS Modernized - Utilities
 * Helper functions for cloning, hashing, and data manipulation
 */

import type { CloneMethod, Doc } from './types.js';

// Generate a unique ID
let idCounter = 0;
export function generateId(): string {
  return `${Date.now().toString(36)}-${(idCounter++).toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// Deep clone using JSON parse/stringify
export function cloneDeep<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// Shallow clone
export function cloneShallow<T extends object>(obj: T): T {
  if (Array.isArray(obj)) {
    return [...obj] as T;
  }
  return { ...obj };
}

// Shallow clone with Object.assign
export function cloneShallowAssign<T extends object>(obj: T): T {
  if (Array.isArray(obj)) {
    return Object.assign([], obj) as T;
  }
  return Object.assign({}, obj);
}

// Recursive shallow clone (shallow for nested objects)
export function cloneShallowRecurse<T>(obj: T, depth = 1): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    if (depth > 0) {
      return obj.map(item => cloneShallowRecurse(item, depth - 1)) as T;
    }
    return [...obj] as T;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const value = (obj as Record<string, unknown>)[key];
    if (depth > 0 && typeof value === 'object' && value !== null) {
      result[key] = cloneShallowRecurse(value, depth - 1);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

// Clone function based on method
export function clone<T extends object>(obj: T, method: CloneMethod = 'parse-stringify'): T {
  switch (method) {
    case 'parse-stringify':
      return cloneDeep(obj);
    case 'shallow':
      return cloneShallow(obj);
    case 'shallow-assign':
      return cloneShallowAssign(obj);
    case 'shallow-recurse-objects':
      return cloneShallowRecurse(obj);
    default:
      return cloneDeep(obj);
  }
}

// Freeze object deeply
export function deepFreeze<T extends object>(obj: T): Readonly<T> {
  const propNames = Object.getOwnPropertyNames(obj);
  for (const name of propNames) {
    const value = (obj as Record<string, unknown>)[name];
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value as object);
    }
  }
  return Object.freeze(obj);
}

// Unfreeze by cloning
export function unFreeze<T extends object>(obj: T): T {
  return cloneDeep(obj);
}

// Check if object has own property
export function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

// Check if value is a plain object
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

// Binary search for sorted arrays
export function binarySearch<T>(
  arr: T[],
  value: T,
  comparator: (a: T, b: T) => number
): { found: boolean; index: number } {
  let low = 0;
  let high = arr.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const midVal = arr[mid];
    if (midVal === undefined) break;
    const cmp = comparator(midVal, value);

    if (cmp < 0) {
      low = mid + 1;
    } else if (cmp > 0) {
      high = mid - 1;
    } else {
      return { found: true, index: mid };
    }
  }

  return { found: false, index: low };
}

// Calculate hash for index keys
export function calculateHash(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

// Validate document ID
export function isValidLokiId(id: unknown): id is number {
  return typeof id === 'number' && Number.isInteger(id) && id > 0;
}

// Strip Loki metadata from document
export function stripLokiMetadata<T extends object>(doc: Doc<T>): T {
  const { $loki, meta, ...rest } = doc;
  return rest as T;
}

// Add Loki metadata to document
export function addLokiMetadata<T extends object>(
  doc: T,
  id: number,
  created: number = Date.now()
): Doc<T> {
  return {
    ...doc,
    $loki: id,
    meta: {
      created,
      revision: 0,
    },
  };
}

// Update metadata on document update
export function updateMetadata<T extends object>(doc: Doc<T>): Doc<T> {
  return {
    ...doc,
    meta: {
      ...doc.meta,
      updated: Date.now(),
      revision: doc.meta.revision + 1,
    },
  };
}

// Debounce function for autosave
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

// Throttle function
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

// Type guard for checking if value is Doc<T>
export function isLokiDocument<T extends object>(value: unknown): value is Doc<T> {
  return (
    value !== null &&
    typeof value === 'object' &&
    '$loki' in value &&
    'meta' in value &&
    typeof (value as Doc<T>).$loki === 'number' &&
    typeof (value as Doc<T>).meta === 'object'
  );
}

// Safe JSON parse with validation
export function safeJsonParse<T>(
  json: string,
  validator?: (data: unknown) => data is T
): T | null {
  try {
    const data = JSON.parse(json);
    if (validator && !validator(data)) {
      return null;
    }
    return data as T;
  } catch {
    return null;
  }
}
