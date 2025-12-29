/**
 * LokiJS Modernized
 * A lightweight, document-oriented database for Node.js
 *
 * Features:
 * - TypeScript-first with full type safety
 * - Promise-based async API
 * - Multiple persistence adapters (fs, memory, encrypted, compressed)
 * - Binary and unique indices
 * - Dynamic views for live queries
 * - Query operators ($eq, $gt, $in, $regex, etc.)
 * - Event system for change tracking
 */

// Core classes
export { Loki } from './database.js';
export { Collection } from './collection.js';
export { ResultSet } from './resultset.js';
export { DynamicView } from './dynamicview.js';

// Event system
export { LokiEventEmitter } from './events.js';
export type { DatabaseEvents, CollectionEvents, EventCallback } from './events.js';

// Persistence adapters
export {
  MemoryAdapter,
  FsAdapter,
  IncrementalFsAdapter,
  EncryptedFsAdapter,
  CompressedFsAdapter,
  createAdapter,
} from './adapters.js';

// Query operators
export {
  operators,
  matchesQuery,
  evaluateOperator,
  evaluateOperators,
  getNestedProperty,
  createComparator,
  createCompoundComparator,
  isQueryOperator,
  isOperatorKey,
} from './operators.js';

// Utilities
export {
  generateId,
  clone,
  cloneDeep,
  cloneShallow,
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
} from './utils.js';

// Types
export type {
  LokiDocument,
  DocumentMeta,
  Doc,
  CollectionOptions,
  CloneMethod,
  SerializationOptions,
  DatabaseOptions,
  PersistenceAdapter,
  DynamicViewOptions,
  ResultSetOptions,
  SortCriteria,
  SimpleSortOptions,
  QueryOperators,
  Query,
  TransformStep,
  ChangeData,
  CollectionChange,
  DatabaseChange,
  UniqueIndex,
  BinaryIndex,
  SerializedCollection,
  SerializedDynamicView,
  SerializedDatabase,
} from './types.js';

// Default export
export { Loki as default } from './database.js';
