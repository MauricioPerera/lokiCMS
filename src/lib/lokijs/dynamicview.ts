/**
 * LokiJS Modernized - DynamicView
 * Persistent filtered view with automatic updates
 */

import type { Collection } from './collection.js';
import { ResultSet } from './resultset.js';
import { LokiEventEmitter } from './events.js';
import { matchesQuery } from './operators.js';
import type {
  Doc,
  Query,
  DynamicViewOptions,
  SortCriteria,
  SerializedDynamicView,
} from './types.js';

interface DynamicViewEvents<T> {
  rebuild: { name: string };
  filter: { type: 'find' | 'where' };
  sort: { criteria: unknown };
  [key: string]: unknown;
}

export class DynamicView<T extends object = object> extends LokiEventEmitter<DynamicViewEvents<T>> {
  name: string;
  collection: Collection<T>;
  rebuildPending = false;
  resultset: ResultSet<T>;
  resultdata: Doc<T>[] = [];
  resultsdirty = true;
  cachedresultset: ResultSet<T> | null = null;

  filterPipeline: Array<{
    type: 'find' | 'where';
    val: Query<T> | ((doc: Doc<T>) => boolean);
    uid?: string | number;
  }> = [];

  sortFunction: ((a: Doc<T>, b: Doc<T>) => number) | null = null;
  sortCriteria: SortCriteria<T>[] | null = null;
  sortCriteriaSimple: { field: keyof T; desc: boolean } | null = null;
  sortDirty = false;

  options: DynamicViewOptions;
  private minRebuildInterval: number;
  private lastRebuild: number = 0;

  constructor(
    collection: Collection<T>,
    name: string,
    options: DynamicViewOptions = {}
  ) {
    super();
    this.collection = collection;
    this.name = name;
    this.options = options;
    this.minRebuildInterval = options.minRebuildInterval ?? 1;
    this.resultset = new ResultSet(collection);

    if (options.persistent) {
      this.rebuild();
    }
  }

  // Apply find filter
  applyFind(query: Query<T>, uid?: string | number): this {
    this.filterPipeline.push({
      type: 'find',
      val: query,
      uid,
    });

    if (this.options.persistent) {
      this.resultsdirty = true;
      this.scheduleRebuild();
    }

    this.emit('filter', { type: 'find' });
    return this;
  }

  // Apply where filter
  applyWhere(fn: (doc: Doc<T>) => boolean, uid?: string | number): this {
    this.filterPipeline.push({
      type: 'where',
      val: fn,
      uid,
    });

    if (this.options.persistent) {
      this.resultsdirty = true;
      this.scheduleRebuild();
    }

    this.emit('filter', { type: 'where' });
    return this;
  }

  // Remove filter by UID
  removeFilter(uid: string | number): this {
    const idx = this.filterPipeline.findIndex(f => f.uid === uid);
    if (idx !== -1) {
      this.filterPipeline.splice(idx, 1);
      this.resultsdirty = true;
      this.scheduleRebuild();
    }
    return this;
  }

  // Apply simple sort
  applySimpleSort(field: keyof T, desc = false): this {
    this.sortCriteriaSimple = { field, desc };
    this.sortCriteria = null;
    this.sortFunction = null;
    this.sortDirty = true;

    if (this.options.persistent) {
      this.scheduleRebuild();
    }

    this.emit('sort', { criteria: { field, desc } });
    return this;
  }

  // Apply compound sort
  applySortCriteria(criteria: SortCriteria<T>[]): this {
    this.sortCriteria = criteria;
    this.sortCriteriaSimple = null;
    this.sortFunction = null;
    this.sortDirty = true;

    if (this.options.persistent) {
      this.scheduleRebuild();
    }

    this.emit('sort', { criteria });
    return this;
  }

  // Apply custom sort function
  applySort(comparator: (a: Doc<T>, b: Doc<T>) => number): this {
    this.sortFunction = comparator;
    this.sortCriteria = null;
    this.sortCriteriaSimple = null;
    this.sortDirty = true;

    if (this.options.persistent) {
      this.scheduleRebuild();
    }

    this.emit('sort', { criteria: 'custom' });
    return this;
  }

  // Remove sort
  removeSort(): this {
    this.sortFunction = null;
    this.sortCriteria = null;
    this.sortCriteriaSimple = null;
    this.sortDirty = false;
    return this;
  }

  // Get data
  data(): Doc<T>[] {
    if (this.options.persistent) {
      if (this.resultsdirty) {
        this.forceRebuild();
      }
      return this.resultdata;
    }

    return this.buildResultSet().data();
  }

  // Get count
  count(): number {
    if (this.options.persistent) {
      if (this.resultsdirty) {
        this.forceRebuild();
      }
      return this.resultdata.length;
    }

    return this.buildResultSet().count();
  }

  // Get ResultSet for chaining
  branchResultset(): ResultSet<T> {
    return this.buildResultSet().copy();
  }

  // Build result set from filters
  private buildResultSet(): ResultSet<T> {
    let rs = this.collection.chain();

    for (const filter of this.filterPipeline) {
      if (filter.type === 'find') {
        rs = rs.find(filter.val as Query<T>);
      } else {
        rs = rs.where(filter.val as (doc: Doc<T>) => boolean);
      }
    }

    // Apply sorting
    if (this.sortCriteriaSimple) {
      rs = rs.simplesort(this.sortCriteriaSimple.field, this.sortCriteriaSimple.desc);
    } else if (this.sortCriteria) {
      rs = rs.compoundsort(this.sortCriteria);
    } else if (this.sortFunction) {
      rs = rs.sort(this.sortFunction);
    }

    return rs;
  }

  // Rebuild the view (public method - always works)
  rebuild(): void {
    this.performRebuild();
  }

  // Force rebuild bypassing throttle (for synchronous data access)
  private forceRebuild(): void {
    this.performRebuild();
  }

  // Perform the actual rebuild
  private performRebuild(): void {
    this.resultset = this.buildResultSet();
    this.resultdata = this.resultset.data();
    this.resultsdirty = false;
    this.sortDirty = false;
    this.lastRebuild = Date.now();
    this.rebuildPending = false;

    this.emit('rebuild', { name: this.name });
  }

  // Schedule rebuild with debounce/throttle
  private scheduleRebuild(): void {
    if (this.rebuildPending) return;

    const now = Date.now();
    if (now - this.lastRebuild < this.minRebuildInterval) {
      // Throttle: schedule for later
      this.rebuildPending = true;
      setTimeout(() => {
        if (this.rebuildPending) {
          this.performRebuild();
        }
      }, this.minRebuildInterval);
      return;
    }

    this.rebuildPending = true;
    queueMicrotask(() => {
      if (this.rebuildPending) {
        this.performRebuild();
      }
    });
  }

  // Evaluate document for inclusion
  evaluateDocument(doc: Doc<T>, isNew: boolean): void {
    if (!this.options.persistent) return;

    const shouldInclude = this.matchesFilters(doc);
    const currentIdx = this.resultdata.findIndex(d => d.$loki === doc.$loki);
    const isIncluded = currentIdx !== -1;

    if (shouldInclude && !isIncluded) {
      // Add document
      this.resultdata.push(doc);
      this.sortDirty = true;
    } else if (!shouldInclude && isIncluded) {
      // Remove document
      this.resultdata.splice(currentIdx, 1);
    } else if (shouldInclude && isIncluded) {
      // Update document
      this.resultdata[currentIdx] = doc;
      this.sortDirty = true;
    }

    if (this.sortDirty && this.resultdata.length > 1) {
      this.applySorting();
    }
  }

  // Remove document by ID
  removeDocument(id: number): void {
    if (!this.options.persistent) return;

    const idx = this.resultdata.findIndex(d => d.$loki === id);
    if (idx !== -1) {
      this.resultdata.splice(idx, 1);
    }
  }

  // Check if document matches all filters
  private matchesFilters(doc: Doc<T>): boolean {
    for (const filter of this.filterPipeline) {
      if (filter.type === 'find') {
        if (!matchesQuery(doc, filter.val as Query<T>)) {
          return false;
        }
      } else {
        if (!(filter.val as (doc: Doc<T>) => boolean)(doc)) {
          return false;
        }
      }
    }
    return true;
  }

  // Apply sorting to result data
  private applySorting(): void {
    if (this.sortCriteriaSimple) {
      const { field, desc } = this.sortCriteriaSimple;
      this.resultdata.sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];
        let result: number;
        if (aVal < bVal) result = -1;
        else if (aVal > bVal) result = 1;
        else result = 0;
        return desc ? -result : result;
      });
    } else if (this.sortFunction) {
      this.resultdata.sort(this.sortFunction);
    } else if (this.sortCriteria) {
      // Compound sort
      this.resultdata.sort((a, b) => {
        for (const criterion of this.sortCriteria!) {
          const [field, desc] = Array.isArray(criterion)
            ? criterion
            : [criterion, false];
          const aVal = a[field as keyof T];
          const bVal = b[field as keyof T];
          let result: number;
          if (aVal < bVal) result = -1;
          else if (aVal > bVal) result = 1;
          else result = 0;
          if (result !== 0) {
            return desc ? -result : result;
          }
        }
        return 0;
      });
    }
    this.sortDirty = false;
  }

  // Serialize dynamic view
  serialize(): SerializedDynamicView<T> {
    return {
      name: this.name,
      filterPipeline: this.filterPipeline.map(f => ({
        type: f.type,
        val: f.type === 'find' ? f.val : f.val.toString(),
        uid: f.uid,
      })) as SerializedDynamicView<T>['filterPipeline'],
      sortCriteria: this.sortCriteria,
      sortCriteriaSimple: this.sortCriteriaSimple,
      options: this.options,
    };
  }

  // Deserialize dynamic view
  deserialize(data: SerializedDynamicView<T>): void {
    this.options = data.options;
    this.sortCriteria = data.sortCriteria;
    this.sortCriteriaSimple = data.sortCriteriaSimple;

    // Restore filters (find only, where functions cannot be serialized)
    this.filterPipeline = data.filterPipeline
      .filter(f => f.type === 'find')
      .map(f => ({
        type: f.type as 'find',
        val: f.val as Query<T>,
        uid: f.uid,
      }));

    if (this.options.persistent) {
      this.rebuild();
    }
  }
}
