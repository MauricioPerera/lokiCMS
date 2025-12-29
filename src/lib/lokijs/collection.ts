/**
 * LokiJS Modernized - Collection
 * Document storage with indexing, querying, and events
 */

import { LokiEventEmitter, type CollectionEvents } from './events.js';
import { ResultSet } from './resultset.js';
import { matchesQuery } from './operators.js';
import { clone, addLokiMetadata, updateMetadata, isLokiDocument } from './utils.js';
import type {
  Doc,
  Query,
  CollectionOptions,
  CloneMethod,
  BinaryIndex,
  UniqueIndex,
  TransformStep,
  CollectionChange,
  SerializedCollection,
  DynamicViewOptions,
} from './types.js';
import { DynamicView } from './dynamicview.js';

export class Collection<T extends object = object> extends LokiEventEmitter<CollectionEvents<T>> {
  name: string;
  data: Doc<T>[] = [];
  idIndex: number[] = [];
  binaryIndices: Record<string, BinaryIndex<T>> = {};
  constraints: {
    unique: Record<string, UniqueIndex<T>>;
  } = { unique: {} };
  uniqueNames: (keyof T)[] = [];
  transforms: Record<string, TransformStep<T>[]> = {};
  objType: string;
  dirty = false;
  cachedIndex: number[] | null = null;
  cachedBinaryIndex: Record<string, number[]> | null = null;
  cachedData: Doc<T>[] | null = null;
  adaptiveBinaryIndices = true;
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
  } = { age: null, ttlInterval: null, daemon: null };
  maxId = 0;
  dynamicViews: DynamicView<T>[] = [];
  changes: CollectionChange<T>[] = [];
  options: CollectionOptions<T>;

  constructor(name: string, options: CollectionOptions<T> = {}) {
    super();
    this.name = name;
    this.objType = name;
    this.options = options;

    this.transactional = options.transactional ?? false;
    this.cloneObjects = options.clone ?? false;
    this.cloneMethod = options.cloneMethod ?? 'parse-stringify';
    this.disableMeta = options.disableMeta ?? false;
    this.disableChangesApi = options.disableChangesApi ?? true;
    this.disableDeltaChangesApi = options.disableDeltaChangesApi ?? true;
    this.autoupdate = options.autoupdate ?? false;
    this.serializableIndices = options.serializableIndices ?? true;

    // Setup unique constraints
    if (options.unique) {
      for (const field of options.unique) {
        this.uniqueNames.push(field);
        this.constraints.unique[field as string] = {
          field,
          keyMap: new Map(),
        };
      }
    }

    // Setup binary indices
    if (options.indices) {
      for (const field of options.indices) {
        this.ensureIndex(field);
      }
    }

    // Setup TTL
    if (options.ttl !== undefined) {
      this.ttl.age = options.ttl;
      this.ttl.ttlInterval = options.ttlInterval ?? 60000;
      this.setTTL(this.ttl.age, this.ttl.ttlInterval);
    }
  }

  // Insert a document
  insert(doc: T | T[]): Doc<T> | Doc<T>[] {
    if (Array.isArray(doc)) {
      return this.insertMany(doc);
    }
    return this.insertOne(doc);
  }

  // Insert single document
  insertOne(doc: T): Doc<T> {
    // Validate against unique constraints
    this.validateUniqueConstraints(doc);

    // Clone if needed
    let insertDoc = this.cloneObjects ? clone(doc, this.cloneMethod) : doc;

    // Add metadata
    this.maxId++;
    const lokiDoc = addLokiMetadata(insertDoc, this.maxId);

    // Emit pre-insert
    this.emit('pre-insert', lokiDoc);

    // Add to data array
    this.data.push(lokiDoc);

    // Update indices
    const idx = this.data.length - 1;
    this.idIndex.push(lokiDoc.$loki);
    this.addToUniqueIndex(lokiDoc);
    this.addToBinaryIndices(lokiDoc, idx);

    // Track changes
    if (!this.disableChangesApi) {
      this.createChange(lokiDoc, 'I');
    }

    this.dirty = true;

    // Emit insert
    this.emit('insert', lokiDoc);

    // Update dynamic views
    for (const dv of this.dynamicViews) {
      dv.evaluateDocument(lokiDoc, true);
    }

    return lokiDoc;
  }

  // Insert multiple documents
  insertMany(docs: T[]): Doc<T>[] {
    return docs.map(doc => this.insertOne(doc));
  }

  // Find documents by query
  find(query?: Query<T>): Doc<T>[] {
    return this.chain().find(query).data();
  }

  // Find one document
  findOne(query?: Query<T>): Doc<T> | null {
    const result = this.chain().find(query).limit(1).data();
    return result[0] ?? null;
  }

  // Find document by ID
  get(id: number): Doc<T> | null {
    const idx = this.idIndex.indexOf(id);
    if (idx === -1) return null;
    return this.data[idx] ?? null;
  }

  // Find document by ID (alias)
  findById(id: number): Doc<T> | null {
    return this.get(id);
  }

  // Find by unique index
  by(field: keyof T, value: unknown): Doc<T> | null {
    const constraint = this.constraints.unique[field as string];
    if (!constraint) {
      throw new Error(`Field '${String(field)}' is not a unique index`);
    }
    return constraint.keyMap.get(value) ?? null;
  }

  // Create a ResultSet chain
  chain(): ResultSet<T> {
    return new ResultSet(this);
  }

  // Update a document
  update(doc: Doc<T> | Doc<T>[]): void {
    if (Array.isArray(doc)) {
      for (const d of doc) {
        this.updateOne(d);
      }
      return;
    }
    this.updateOne(doc);
  }

  // Update single document
  private updateOne(doc: Doc<T>): void {
    if (!isLokiDocument(doc)) {
      throw new Error('Document must have $loki property for update');
    }

    const idx = this.idIndex.indexOf(doc.$loki);
    if (idx === -1) {
      throw new Error(`Document with id ${doc.$loki} not found`);
    }

    const oldDoc = this.data[idx]!;

    // Validate unique constraints (excluding self)
    this.validateUniqueConstraints(doc, oldDoc.$loki);

    // Emit pre-update
    this.emit('pre-update', doc);

    // Remove old from indices
    this.removeFromUniqueIndex(oldDoc);

    // Update metadata
    const updatedDoc = this.disableMeta ? doc : updateMetadata(doc);

    // Clone if needed
    const finalDoc = this.cloneObjects ? clone(updatedDoc, this.cloneMethod) : updatedDoc;

    // Update in data array
    this.data[idx] = finalDoc;

    // Update indices
    this.addToUniqueIndex(finalDoc);
    this.updateBinaryIndices(finalDoc, idx);

    // Track changes
    if (!this.disableChangesApi) {
      this.createChange(finalDoc, 'U');
    }

    this.dirty = true;

    // Emit update
    this.emit('update', finalDoc);

    // Update dynamic views
    for (const dv of this.dynamicViews) {
      dv.evaluateDocument(finalDoc, false);
    }
  }

  // Remove a document
  remove(doc: Doc<T> | number): void {
    let docToRemove: Doc<T> | null = null;

    if (typeof doc === 'number') {
      docToRemove = this.get(doc);
    } else {
      docToRemove = doc;
    }

    if (!docToRemove) {
      throw new Error('Document not found');
    }

    const idx = this.idIndex.indexOf(docToRemove.$loki);
    if (idx === -1) {
      throw new Error('Document not found in index');
    }

    // Remove from indices
    this.removeFromUniqueIndex(docToRemove);
    this.removeFromBinaryIndices(docToRemove, idx);

    // Remove from data array
    this.data.splice(idx, 1);
    this.idIndex.splice(idx, 1);

    // Update binary index positions
    this.rebuildBinaryIndicesPositions(idx);

    // Track changes
    if (!this.disableChangesApi) {
      this.createChange(docToRemove, 'R');
    }

    this.dirty = true;

    // Emit delete
    this.emit('delete', docToRemove);

    // Update dynamic views
    for (const dv of this.dynamicViews) {
      dv.removeDocument(docToRemove.$loki);
    }
  }

  // Find and remove documents
  findAndRemove(query: Query<T>): void {
    const results = this.find(query);
    for (const doc of results) {
      this.remove(doc);
    }
  }

  // Find and update documents
  findAndUpdate(query: Query<T>, updateFn: (doc: Doc<T>) => Doc<T>): void {
    const results = this.find(query);
    for (const doc of results) {
      const updated = updateFn(doc);
      this.update(updated);
    }
  }

  // Clear all documents
  clear(): void {
    this.data = [];
    this.idIndex = [];
    this.maxId = 0;
    this.dirty = true;

    // Clear indices
    for (const constraint of Object.values(this.constraints.unique)) {
      constraint.keyMap.clear();
    }

    for (const index of Object.values(this.binaryIndices)) {
      index.values = [];
      index.dirty = false;
    }

    // Clear dynamic views
    for (const dv of this.dynamicViews) {
      dv.rebuild();
    }
  }

  // Count documents
  count(query?: Query<T>): number {
    if (!query) {
      return this.data.length;
    }
    return this.chain().find(query).count();
  }

  // Ensure binary index exists
  ensureIndex(field: keyof T, force = false): void {
    const fieldStr = field as string;
    if (this.binaryIndices[fieldStr] && !force) {
      return;
    }

    this.binaryIndices[fieldStr] = {
      name: field,
      dirty: true,
      values: [],
    };

    this.rebuildBinaryIndex(field);
  }

  // Rebuild binary index
  private rebuildBinaryIndex(field: keyof T): void {
    const fieldStr = field as string;
    const index = this.binaryIndices[fieldStr];
    if (!index) return;

    // Create sorted array of indices
    const sortedIndices = this.data
      .map((doc, idx) => ({ value: doc[field], idx }))
      .sort((a, b) => {
        if (a.value < b.value) return -1;
        if (a.value > b.value) return 1;
        return 0;
      })
      .map(item => item.idx);

    index.values = sortedIndices;
    index.dirty = false;
  }

  // Rebuild binary index positions after removal
  private rebuildBinaryIndicesPositions(removedIdx: number): void {
    for (const index of Object.values(this.binaryIndices)) {
      index.values = index.values
        .filter(idx => idx !== removedIdx)
        .map(idx => (idx > removedIdx ? idx - 1 : idx));
    }
  }

  // Add document to binary indices
  private addToBinaryIndices(doc: Doc<T>, idx: number): void {
    for (const [fieldStr, index] of Object.entries(this.binaryIndices)) {
      const field = fieldStr as keyof T;
      const value = doc[field];

      // Find insertion point
      let insertIdx = index.values.length;
      for (let i = 0; i < index.values.length; i++) {
        const existingDoc = this.data[index.values[i]!];
        if (existingDoc && existingDoc[field] > value) {
          insertIdx = i;
          break;
        }
      }

      index.values.splice(insertIdx, 0, idx);
    }
  }

  // Update binary indices for document
  private updateBinaryIndices(doc: Doc<T>, idx: number): void {
    // For now, mark as dirty and rebuild
    for (const index of Object.values(this.binaryIndices)) {
      index.dirty = true;
    }

    if (this.adaptiveBinaryIndices) {
      for (const field of Object.keys(this.binaryIndices) as (keyof T)[]) {
        this.rebuildBinaryIndex(field);
      }
    }
  }

  // Remove document from binary indices
  private removeFromBinaryIndices(_doc: Doc<T>, idx: number): void {
    for (const index of Object.values(this.binaryIndices)) {
      const pos = index.values.indexOf(idx);
      if (pos !== -1) {
        index.values.splice(pos, 1);
      }
    }
  }

  // Validate unique constraints
  private validateUniqueConstraints(doc: T, excludeId?: number): void {
    for (const [fieldStr, constraint] of Object.entries(this.constraints.unique)) {
      const field = fieldStr as keyof T;
      const value = doc[field];
      const existing = constraint.keyMap.get(value);

      if (existing && existing.$loki !== excludeId) {
        throw new Error(
          `Unique constraint violation: field '${String(field)}' already has value '${String(value)}'`
        );
      }
    }
  }

  // Add document to unique index
  private addToUniqueIndex(doc: Doc<T>): void {
    for (const [fieldStr, constraint] of Object.entries(this.constraints.unique)) {
      const field = fieldStr as keyof T;
      const value = doc[field];
      constraint.keyMap.set(value, doc);
    }
  }

  // Remove document from unique index
  private removeFromUniqueIndex(doc: Doc<T>): void {
    for (const [fieldStr, constraint] of Object.entries(this.constraints.unique)) {
      const field = fieldStr as keyof T;
      const value = doc[field];
      constraint.keyMap.delete(value);
    }
  }

  // Create change record
  private createChange(doc: Doc<T>, operation: 'I' | 'U' | 'R'): void {
    this.changes.push({
      name: this.name,
      operation,
      obj: this.cloneObjects ? clone(doc, this.cloneMethod) : doc,
    });
  }

  // Get and clear changes
  flushChanges(): CollectionChange<T>[] {
    const changes = this.changes;
    this.changes = [];
    return changes;
  }

  // Add named transform
  addTransform(name: string, transform: TransformStep<T>[]): void {
    if (this.transforms[name]) {
      throw new Error(`Transform '${name}' already exists`);
    }
    this.transforms[name] = transform;
  }

  // Remove transform
  removeTransform(name: string): void {
    delete this.transforms[name];
  }

  // Execute transform
  transform(name: string): unknown {
    const transform = this.transforms[name];
    if (!transform) {
      throw new Error(`Transform '${name}' not found`);
    }

    let rs: ResultSet<T> = this.chain();

    for (const step of transform) {
      switch (step.type) {
        case 'find':
          rs = rs.find(step.value as Query<T>);
          break;
        case 'where':
          rs = rs.where(step.value as (doc: Doc<T>) => boolean);
          break;
        case 'simplesort':
          rs = rs.simplesort(step.property as keyof T, step.desc);
          break;
        case 'limit':
          rs = rs.limit(step.value as number);
          break;
        case 'offset':
          rs = rs.offset(step.value as number);
          break;
      }
    }

    return rs.data();
  }

  // Create dynamic view
  addDynamicView(name: string, options?: DynamicViewOptions): DynamicView<T> {
    const existingIdx = this.dynamicViews.findIndex(dv => dv.name === name);
    if (existingIdx !== -1) {
      throw new Error(`DynamicView '${name}' already exists`);
    }

    const dv = new DynamicView(this, name, options);
    this.dynamicViews.push(dv);
    return dv;
  }

  // Get dynamic view
  getDynamicView(name: string): DynamicView<T> | null {
    return this.dynamicViews.find(dv => dv.name === name) ?? null;
  }

  // Remove dynamic view
  removeDynamicView(name: string): void {
    const idx = this.dynamicViews.findIndex(dv => dv.name === name);
    if (idx !== -1) {
      this.dynamicViews.splice(idx, 1);
    }
  }

  // Set TTL
  setTTL(age: number, interval: number): void {
    if (this.ttl.daemon) {
      clearInterval(this.ttl.daemon);
    }

    this.ttl.age = age;
    this.ttl.ttlInterval = interval;

    if (age > 0) {
      this.ttl.daemon = setInterval(() => {
        this.removeExpired();
      }, interval);
    }
  }

  // Remove expired documents
  private removeExpired(): void {
    if (!this.ttl.age) return;

    const now = Date.now();
    const maxAge = this.ttl.age;

    const expired = this.data.filter(doc => {
      const created = doc.meta.updated ?? doc.meta.created;
      return now - created > maxAge;
    });

    for (const doc of expired) {
      this.remove(doc);
    }
  }

  // Serialize collection
  serialize(): SerializedCollection<T> {
    return {
      name: this.name,
      data: this.data,
      idIndex: this.idIndex,
      binaryIndices: this.serializableIndices
        ? this.binaryIndices
        : ({} as Record<string, BinaryIndex<T>>),
      uniqueNames: this.uniqueNames,
      transforms: this.transforms,
      objType: this.objType,
      transactional: this.transactional,
      cloneObjects: this.cloneObjects,
      cloneMethod: this.cloneMethod,
      disableMeta: this.disableMeta,
      disableChangesApi: this.disableChangesApi,
      disableDeltaChangesApi: this.disableDeltaChangesApi,
      autoupdate: this.autoupdate,
      serializableIndices: this.serializableIndices,
      maxId: this.maxId,
      dynamicViews: this.dynamicViews.map(dv => dv.serialize()),
      options: this.options,
      ttl: this.ttl.age
        ? { age: this.ttl.age, ttlInterval: this.ttl.ttlInterval }
        : undefined,
    };
  }

  // Load from serialized data
  static deserialize<T extends object>(
    serialized: SerializedCollection<T>
  ): Collection<T> {
    const collection = new Collection<T>(serialized.name, serialized.options);

    collection.data = serialized.data;
    collection.idIndex = serialized.idIndex;
    collection.maxId = serialized.maxId;
    collection.transforms = serialized.transforms;
    collection.uniqueNames = serialized.uniqueNames;
    collection.transactional = serialized.transactional;
    collection.cloneObjects = serialized.cloneObjects;
    collection.cloneMethod = serialized.cloneMethod;
    collection.disableMeta = serialized.disableMeta;
    collection.disableChangesApi = serialized.disableChangesApi;
    collection.disableDeltaChangesApi = serialized.disableDeltaChangesApi;
    collection.autoupdate = serialized.autoupdate;
    collection.serializableIndices = serialized.serializableIndices;

    // Rebuild unique indices
    for (const field of collection.uniqueNames) {
      collection.constraints.unique[field as string] = {
        field,
        keyMap: new Map(),
      };
    }
    for (const doc of collection.data) {
      collection.addToUniqueIndex(doc);
    }

    // Rebuild binary indices
    if (serialized.binaryIndices && Object.keys(serialized.binaryIndices).length > 0) {
      collection.binaryIndices = serialized.binaryIndices;
    } else {
      for (const field of Object.keys(collection.binaryIndices) as (keyof T)[]) {
        collection.rebuildBinaryIndex(field);
      }
    }

    // Rebuild dynamic views
    for (const dvData of serialized.dynamicViews) {
      const dv = collection.addDynamicView(dvData.name, dvData.options);
      dv.deserialize(dvData);
    }

    // Setup TTL
    if (serialized.ttl?.age) {
      collection.setTTL(serialized.ttl.age, serialized.ttl.ttlInterval ?? 60000);
    }

    return collection;
  }
}
