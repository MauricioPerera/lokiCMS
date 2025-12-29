/**
 * LokiJS Modernized - Type Definitions
 * A lightweight, document-oriented database for Node.js
 */

export interface LokiDocument {
  $loki: number;
  meta: DocumentMeta;
}

export interface DocumentMeta {
  created: number;
  revision: number;
  updated?: number;
  version?: number;
}

export type Doc<T> = T & LokiDocument;

export interface CollectionOptions<T> {
  unique?: (keyof T)[];
  indices?: (keyof T)[];
  clone?: boolean;
  cloneMethod?: CloneMethod;
  disableMeta?: boolean;
  disableChangesApi?: boolean;
  disableDeltaChangesApi?: boolean;
  autoupdate?: boolean;
  serializableIndices?: boolean;
  transactional?: boolean;
  ttl?: number;
  ttlInterval?: number;
}

export type CloneMethod = 'parse-stringify' | 'shallow' | 'shallow-assign' | 'shallow-recurse-objects';

export interface SerializationOptions {
  serializationMethod?: 'normal' | 'pretty' | 'destructured';
  destructureDelimiter?: string;
}

export interface DatabaseOptions extends SerializationOptions {
  adapter?: PersistenceAdapter;
  autoload?: boolean;
  autoloadCallback?: () => void;
  autosave?: boolean;
  autosaveInterval?: number;
  autosaveCallback?: () => void;
  persistenceMethod?: 'fs' | 'memory';
  env?: 'NODEJS' | 'BROWSER';
  verbose?: boolean;
}

export interface PersistenceAdapter {
  loadDatabase(dbname: string): Promise<string | null>;
  saveDatabase(dbname: string, dbstring: string): Promise<void>;
  deleteDatabase?(dbname: string): Promise<void>;
  mode?: 'reference';
}

export interface DynamicViewOptions {
  persistent?: boolean;
  minRebuildInterval?: number;
  sortPriority?: 'passive' | 'active';
}

export interface ResultSetOptions<T> {
  firstOnly?: boolean;
  sortCriteria?: SortCriteria<T> | SortCriteria<T>[];
}

export type SortCriteria<T> = keyof T | [keyof T, boolean];

export interface SimpleSortOptions {
  desc?: boolean;
  disableIndexIntersect?: boolean;
  useJavascriptSorting?: boolean;
}

// Query operators
export interface QueryOperators<T = unknown> {
  $eq?: T;
  $ne?: T;
  $gt?: T;
  $gte?: T;
  $lt?: T;
  $lte?: T;
  $in?: T[];
  $nin?: T[];
  $between?: [T, T];
  $regex?: RegExp | string;
  $contains?: T;
  $containsAny?: T[];
  $containsNone?: T[];
  $type?: string;
  $finite?: boolean;
  $size?: number;
  $len?: number;
  $exists?: boolean;
  $elemMatch?: Query<T>;
  $and?: Query<T>[];
  $or?: Query<T>[];
  $not?: Query<T>;
}

export type Query<T> = {
  [K in keyof T]?: T[K] | QueryOperators<T[K]>;
} & {
  $and?: Query<T>[];
  $or?: Query<T>[];
  $not?: Query<T>;
};

export interface TransformStep<T> {
  type: 'find' | 'where' | 'simplesort' | 'compoundsort' | 'sort' | 'limit' | 'offset' | 'map' | 'eqJoin' | 'mapReduce' | 'update' | 'remove';
  value?: Query<T> | ((doc: T) => boolean) | SortCriteria<T> | number | ((doc: T) => unknown);
  property?: keyof T;
  desc?: boolean;
  dataOptions?: unknown;
  joinData?: Collection<object>;
  leftJoinKey?: string;
  rightJoinKey?: string;
  mapFun?: (left: T, right: unknown) => unknown;
  mapFunction?: (doc: T) => unknown;
  reduceFunction?: (docs: unknown[]) => unknown;
}

export interface ChangeData<T> {
  name: string;
  operation: 'I' | 'U' | 'R';
  obj: Doc<T>;
}

export interface CollectionChange<T> {
  name: string;
  operation: 'I' | 'U' | 'R';
  obj: Doc<T>;
}

export interface DatabaseChange {
  name: string;
  operation: 'I' | 'U' | 'R';
  obj: LokiDocument;
}

export interface UniqueIndex<T> {
  field: keyof T;
  keyMap: Map<unknown, Doc<T>>;
}

export interface BinaryIndex<T> {
  name: keyof T;
  dirty: boolean;
  values: number[];
}

// Collection type for forward reference
export interface Collection<T extends object = object> {
  name: string;
  data: Doc<T>[];
  idIndex: number[];
  binaryIndices: Record<string, BinaryIndex<T>>;
  constraints: {
    unique: Record<string, UniqueIndex<T>>;
  };
  uniqueNames: (keyof T)[];
  transforms: Record<string, TransformStep<T>[]>;
  objType: string;
  dirty: boolean;
  cachedIndex: number[] | null;
  cachedBinaryIndex: Record<string, number[]> | null;
  cachedData: Doc<T>[] | null;
  adaptiveBinaryIndices: boolean;
  transactional: boolean;
  cloneObjects: boolean;
  cloneMethod: CloneMethod;
  disableMeta: boolean;
  disableChangesApi: boolean;
  disableDeltaChangesApi: boolean;
  autoupdate: boolean;
  serializableIndices: boolean;
  ttl: {
    age: number | null;
    ttlInterval: number | null;
    daemon: ReturnType<typeof setInterval> | null;
  };
  maxId: number;
  dynamicViews: DynamicView<T>[];
  changes: CollectionChange<T>[];
  options: CollectionOptions<T>;
}

// DynamicView type for forward reference
export interface DynamicView<T extends object = object> {
  name: string;
  collection: Collection<T>;
  rebuildPending: boolean;
  resultset: ResultSet<T>;
  resultdata: Doc<T>[];
  resultsdirty: boolean;
  cachedresultset: ResultSet<T> | null;
  filterPipeline: Array<{
    type: 'find' | 'where';
    val: Query<T> | ((doc: Doc<T>) => boolean);
    uid?: string | number;
  }>;
  sortFunction: ((a: Doc<T>, b: Doc<T>) => number) | null;
  sortCriteria: SortCriteria<T>[] | null;
  sortCriteriaSimple: { field: keyof T; desc: boolean } | null;
  sortDirty: boolean;
  options: DynamicViewOptions;
  events: Map<string, Array<(...args: unknown[]) => void>>;
}

// ResultSet type for forward reference
export interface ResultSet<T extends object = object> {
  collection: Collection<T>;
  filteredrows: number[];
  filterInitialized: boolean;
}

export interface SerializedCollection<T extends object = object> {
  name: string;
  data: Doc<T>[];
  idIndex: number[];
  binaryIndices: Record<string, BinaryIndex<T>>;
  uniqueNames: (keyof T)[];
  transforms: Record<string, TransformStep<T>[]>;
  objType: string;
  transactional: boolean;
  cloneObjects: boolean;
  cloneMethod: CloneMethod;
  disableMeta: boolean;
  disableChangesApi: boolean;
  disableDeltaChangesApi: boolean;
  autoupdate: boolean;
  serializableIndices: boolean;
  maxId: number;
  dynamicViews: SerializedDynamicView<T>[];
  options: CollectionOptions<T>;
  ttl?: {
    age: number | null;
    ttlInterval: number | null;
  };
}

export interface SerializedDynamicView<T extends object = object> {
  name: string;
  filterPipeline: Array<{
    type: 'find' | 'where';
    val: Query<T> | string;
    uid?: string | number;
  }>;
  sortCriteria: SortCriteria<T>[] | null;
  sortCriteriaSimple: { field: keyof T; desc: boolean } | null;
  options: DynamicViewOptions;
}

export interface SerializedDatabase {
  filename: string;
  collections: SerializedCollection[];
  databaseVersion: number;
  engineVersion: number;
  autosave: boolean;
  autosaveInterval: number;
  autosaveHandle: null;
  throttledSaves: boolean;
  persistenceMethod: 'fs' | 'memory' | null;
  persistenceAdapter: null;
  verbose: boolean;
  events: Record<string, never>;
}
