/**
 * LokiJS Modernized - Event Emitter
 * Type-safe event system for database operations
 */

export type EventCallback<T = unknown> = (data: T) => void;

export interface EventMap {
  [event: string]: unknown;
}

export class LokiEventEmitter<T extends EventMap = EventMap> {
  private events: Map<keyof T, Set<EventCallback<T[keyof T]>>> = new Map();
  private asyncListeners: boolean;

  constructor(asyncListeners = false) {
    this.asyncListeners = asyncListeners;
  }

  on<K extends keyof T>(event: K, callback: EventCallback<T[K]>): this {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(callback as EventCallback<T[keyof T]>);
    return this;
  }

  once<K extends keyof T>(event: K, callback: EventCallback<T[K]>): this {
    const wrapper: EventCallback<T[K]> = (data) => {
      this.off(event, wrapper);
      callback(data);
    };
    return this.on(event, wrapper);
  }

  off<K extends keyof T>(event: K, callback?: EventCallback<T[K]>): this {
    if (!callback) {
      this.events.delete(event);
    } else {
      const listeners = this.events.get(event);
      if (listeners) {
        listeners.delete(callback as EventCallback<T[keyof T]>);
        if (listeners.size === 0) {
          this.events.delete(event);
        }
      }
    }
    return this;
  }

  emit<K extends keyof T>(event: K, data?: T[K]): this {
    const listeners = this.events.get(event);
    if (listeners) {
      for (const callback of listeners) {
        if (this.asyncListeners) {
          queueMicrotask(() => callback(data as T[keyof T]));
        } else {
          callback(data as T[keyof T]);
        }
      }
    }
    return this;
  }

  removeAllListeners(): this {
    this.events.clear();
    return this;
  }

  listenerCount<K extends keyof T>(event: K): number {
    return this.events.get(event)?.size ?? 0;
  }

  listeners<K extends keyof T>(event: K): EventCallback<T[K]>[] {
    const listeners = this.events.get(event);
    return listeners ? Array.from(listeners) as EventCallback<T[K]>[] : [];
  }

  eventNames(): (keyof T)[] {
    return Array.from(this.events.keys());
  }
}

// Database-specific events
export interface DatabaseEvents extends EventMap {
  init: { collections: string[] };
  loaded: { filename: string };
  flushChanges: void;
  close: void;
  error: Error;
  warning: string;
}

// Collection-specific events
export interface CollectionEvents<T> extends EventMap {
  insert: T | T[];
  update: T | T[];
  'pre-insert': T | T[];
  'pre-update': T | T[];
  delete: T;
  error: { message: string; document?: T };
  warning: { message: string };
}
