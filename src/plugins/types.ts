/**
 * LokiCMS Plugin System - Type Definitions
 * All interfaces and types for the plugin system
 */

import type { Hono } from 'hono';
import type { z } from 'zod';
import type { Collection } from '../lib/lokijs/index.js';

// ============================================================================
// Plugin Status and Configuration
// ============================================================================

/**
 * Plugin status enumeration
 */
export type PluginStatus = 'loaded' | 'enabled' | 'disabled' | 'error';

/**
 * Plugin source type
 */
export type PluginSource = 'npm' | 'local';

/**
 * Plugin configuration from plugins.json
 */
export interface PluginConfig {
  /** Plugin package name or identifier */
  name: string;
  /** Whether the plugin should be enabled */
  enabled: boolean;
  /** Source type: npm package or local path */
  source: PluginSource;
  /** Local path (required when source is 'local') */
  path?: string;
  /** npm version constraint (optional for npm source) */
  version?: string;
  /** Plugin-specific settings */
  settings?: Record<string, unknown>;
}

/**
 * Complete plugins.json structure
 */
export interface PluginsConfig {
  plugins: PluginConfig[];
}

/**
 * Plugin metadata from package.json lokicms field
 */
export interface PluginPackageMetadata {
  displayName?: string;
  icon?: string;
  minVersion?: string;
  maxVersion?: string;
  dependencies?: string[];
}

/**
 * Plugin package.json structure
 */
export interface PluginPackageJson {
  name: string;
  version: string;
  description?: string;
  author?: string;
  main?: string;
  lokicms?: PluginPackageMetadata;
}

// ============================================================================
// Plugin Definition and Lifecycle
// ============================================================================

/**
 * Plugin lifecycle hooks
 */
export interface PluginLifecycle {
  /** Called when plugin is loaded (before setup) */
  onLoad?: () => Promise<void> | void;
  /** Called when plugin is enabled */
  onEnable?: () => Promise<void> | void;
  /** Called when plugin is disabled */
  onDisable?: () => Promise<void> | void;
  /** Called when plugin is being uninstalled */
  onUninstall?: () => Promise<void> | void;
}

/**
 * Plugin definition - what plugins must export
 */
export interface PluginDefinition {
  /** Unique plugin identifier */
  name: string;
  /** Display name for UI */
  displayName?: string;
  /** Plugin version (semver) */
  version: string;
  /** Plugin description */
  description?: string;
  /** Lifecycle hooks */
  lifecycle?: PluginLifecycle;
  /** Setup function called with plugin API */
  setup: (api: PluginAPI) => Promise<void> | void;
}

// ============================================================================
// Plugin API - What plugins can access
// ============================================================================

/**
 * Main Plugin API - provided to plugins for registration
 */
export interface PluginAPI {
  /** Plugin name for namespacing */
  readonly pluginName: string;
  /** Access to CMS services */
  readonly services: PluginServices;
  /** Hook registration */
  hooks: HookRegistrar;
  /** Route registration */
  routes: RouteRegistrar;
  /** MCP tool registration */
  mcp: MCPRegistrar;
  /** Database collection registration */
  database: DatabaseRegistrar;
  /** Content type registration */
  contentTypes: ContentTypeRegistrar;
  /** Configuration access */
  config: ConfigAccessor;
  /** Logging utilities */
  logger: PluginLogger;
}

/**
 * Service access for plugins
 */
export interface PluginServices {
  entries: {
    create: (input: unknown, authorId: string, authorName?: string) => Promise<unknown>;
    findById: (id: string) => Promise<unknown>;
    findBySlug: (contentType: string, slug: string) => Promise<unknown>;
    findAll: (filters?: unknown) => Promise<unknown>;
    update: (id: string, input: unknown) => Promise<unknown>;
    delete: (id: string) => Promise<void>;
    publish: (id: string) => Promise<unknown>;
    unpublish: (id: string) => Promise<unknown>;
  };
  contentTypes: {
    create: (input: unknown) => Promise<unknown>;
    findById: (id: string) => Promise<unknown>;
    findBySlug: (slug: string) => Promise<unknown>;
    findAll: () => Promise<unknown[]>;
    update: (id: string, input: unknown) => Promise<unknown>;
    delete: (id: string) => Promise<void>;
  };
  taxonomies: {
    create: (input: unknown) => Promise<unknown>;
    findById: (id: string) => Promise<unknown>;
    findBySlug: (slug: string) => Promise<unknown>;
    findAll: () => Promise<unknown[]>;
    update: (id: string, input: unknown) => Promise<unknown>;
    delete: (id: string) => Promise<void>;
  };
  terms: {
    create: (input: unknown) => Promise<unknown>;
    findById: (id: string) => Promise<unknown>;
    findBySlug: (slug: string, taxonomySlug: string) => Promise<unknown>;
    findByTaxonomy: (taxonomyId: string) => Promise<unknown[]>;
    update: (id: string, input: unknown) => Promise<unknown>;
    delete: (id: string) => Promise<void>;
  };
  users: {
    findById: (id: string) => Promise<unknown>;
    findByEmail: (email: string) => Promise<unknown>;
    findAll: () => Promise<unknown[]>;
  };
}

// ============================================================================
// Registrar Interfaces
// ============================================================================

/**
 * Hook registrar interface
 */
export interface HookRegistrar {
  /** Register a hook handler */
  on<T extends HookName>(hookName: T, handler: HookHandler<T>, priority?: number): void;
  /** Unregister a hook handler */
  off<T extends HookName>(hookName: T, handler: HookHandler<T>): void;
}

/**
 * Route registrar interface
 */
export interface RouteRegistrar {
  /** Register routes for this plugin */
  register(routes: Hono): void;
  /** Get the base path for plugin routes */
  getBasePath(): string;
}

/**
 * MCP tool definition
 */
export interface MCPToolDefinition {
  /** Tool description */
  description: string;
  /** Zod schema for input validation */
  inputSchema: z.ZodType;
  /** Tool handler function */
  handler: (args: unknown) => Promise<unknown>;
}

/**
 * MCP registrar interface
 */
export interface MCPRegistrar {
  /** Register an MCP tool */
  registerTool(name: string, tool: MCPToolDefinition): void;
  /** Unregister an MCP tool */
  unregisterTool(name: string): void;
}

/**
 * Collection configuration for plugin collections
 */
export interface CollectionConfig<T extends object = object> {
  /** Collection name (will be prefixed) */
  name: string;
  /** Collection options */
  options?: {
    /** Unique fields */
    unique?: (keyof T & string)[];
    /** Indexed fields */
    indices?: (keyof T & string)[];
  };
}

/**
 * Database registrar interface
 */
export interface DatabaseRegistrar {
  /** Create a new collection */
  createCollection<T extends object>(config: CollectionConfig<T>): Collection<T>;
  /** Get an existing collection */
  getCollection<T extends object>(name: string): Collection<T> | null;
  /** Drop a collection */
  dropCollection(name: string): void;
}

/**
 * Content type field definition
 */
export interface ContentTypeFieldDefinition {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  description?: string;
  defaultValue?: unknown;
  validation?: Record<string, unknown>;
  options?: string[];
}

/**
 * Content type registration
 */
export interface ContentTypeRegistration {
  name: string;
  slug: string;
  description?: string;
  fields: ContentTypeFieldDefinition[];
  titleField?: string;
}

/**
 * Content type registrar interface
 */
export interface ContentTypeRegistrar {
  /** Register a content type */
  register(contentType: ContentTypeRegistration): Promise<void>;
  /** Unregister a content type */
  unregister(slug: string): Promise<void>;
}

/**
 * Configuration accessor interface
 */
export interface ConfigAccessor {
  /** Get a config value */
  get<T = unknown>(key: string, defaultValue?: T): T;
  /** Get all config values */
  getAll(): Record<string, unknown>;
}

/**
 * Plugin logger interface
 */
export interface PluginLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

// ============================================================================
// Hook System Types
// ============================================================================

/**
 * All available hook names
 */
export type HookName =
  // Entry hooks
  | 'entry:beforeCreate'
  | 'entry:afterCreate'
  | 'entry:beforeUpdate'
  | 'entry:afterUpdate'
  | 'entry:beforeDelete'
  | 'entry:afterDelete'
  | 'entry:beforePublish'
  | 'entry:afterPublish'
  | 'entry:beforeUnpublish'
  | 'entry:afterUnpublish'
  // Content type hooks
  | 'contentType:beforeCreate'
  | 'contentType:afterCreate'
  | 'contentType:beforeUpdate'
  | 'contentType:afterUpdate'
  | 'contentType:beforeDelete'
  | 'contentType:afterDelete'
  // Taxonomy hooks
  | 'taxonomy:beforeCreate'
  | 'taxonomy:afterCreate'
  | 'taxonomy:beforeUpdate'
  | 'taxonomy:afterUpdate'
  | 'taxonomy:beforeDelete'
  | 'taxonomy:afterDelete'
  // Term hooks
  | 'term:beforeCreate'
  | 'term:afterCreate'
  | 'term:beforeUpdate'
  | 'term:afterUpdate'
  | 'term:beforeDelete'
  | 'term:afterDelete'
  // User hooks
  | 'user:beforeCreate'
  | 'user:afterCreate'
  | 'user:beforeUpdate'
  | 'user:afterUpdate'
  | 'user:beforeDelete'
  | 'user:afterDelete'
  | 'user:afterLogin'
  // System hooks
  | 'system:ready'
  | 'system:shutdown';

/**
 * Hook payload types for each hook
 */
export interface HookPayloads {
  // Entry hooks
  'entry:beforeCreate': { input: unknown; authorId: string };
  'entry:afterCreate': { entry: unknown };
  'entry:beforeUpdate': { id: string; input: unknown };
  'entry:afterUpdate': { entry: unknown; previousEntry: unknown };
  'entry:beforeDelete': { id: string; entry: unknown };
  'entry:afterDelete': { id: string };
  'entry:beforePublish': { id: string; entry: unknown };
  'entry:afterPublish': { entry: unknown };
  'entry:beforeUnpublish': { id: string; entry: unknown };
  'entry:afterUnpublish': { entry: unknown };
  // Content type hooks
  'contentType:beforeCreate': { input: unknown };
  'contentType:afterCreate': { contentType: unknown };
  'contentType:beforeUpdate': { id: string; input: unknown };
  'contentType:afterUpdate': { contentType: unknown; previousContentType: unknown };
  'contentType:beforeDelete': { id: string; contentType: unknown };
  'contentType:afterDelete': { id: string };
  // Taxonomy hooks
  'taxonomy:beforeCreate': { input: unknown };
  'taxonomy:afterCreate': { taxonomy: unknown };
  'taxonomy:beforeUpdate': { id: string; input: unknown };
  'taxonomy:afterUpdate': { taxonomy: unknown; previousTaxonomy: unknown };
  'taxonomy:beforeDelete': { id: string; taxonomy: unknown };
  'taxonomy:afterDelete': { id: string };
  // Term hooks
  'term:beforeCreate': { input: unknown };
  'term:afterCreate': { term: unknown };
  'term:beforeUpdate': { id: string; input: unknown };
  'term:afterUpdate': { term: unknown; previousTerm: unknown };
  'term:beforeDelete': { id: string; term: unknown };
  'term:afterDelete': { id: string };
  // User hooks
  'user:beforeCreate': { input: unknown };
  'user:afterCreate': { user: unknown };
  'user:beforeUpdate': { id: string; input: unknown };
  'user:afterUpdate': { user: unknown; previousUser: unknown };
  'user:beforeDelete': { id: string; user: unknown };
  'user:afterDelete': { id: string };
  'user:afterLogin': { user: unknown };
  // System hooks
  'system:ready': Record<string, never>;
  'system:shutdown': Record<string, never>;
}

/**
 * Hook handler function type
 */
export type HookHandler<T extends HookName> = (
  payload: HookPayloads[T]
) => Promise<HookPayloads[T] | void> | HookPayloads[T] | void;

// ============================================================================
// Registered Plugin Instance
// ============================================================================

/**
 * Registered plugin instance with runtime state
 */
export interface RegisteredPlugin {
  name: string;
  displayName: string;
  version: string;
  description?: string;
  status: PluginStatus;
  config: PluginConfig;
  definition: PluginDefinition;
  api: PluginAPI;
  error?: Error;
}
