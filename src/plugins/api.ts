/**
 * LokiCMS Plugin System - Plugin API Factory
 * Creates PluginAPI instances for plugins
 */

import type { Hono } from 'hono';
import type {
  PluginAPI,
  PluginServices,
  HookRegistrar,
  RouteRegistrar,
  MCPRegistrar,
  DatabaseRegistrar,
  ContentTypeRegistrar,
  ConfigAccessor,
  PluginLogger,
  HookName,
  HookHandler,
  MCPToolDefinition,
  CollectionConfig,
  ContentTypeRegistration,
} from './types.js';
import { hookSystem } from './hooks.js';
import { mcpToolRegistry } from './mcp-registry.js';
import { routeRegistry } from './route-registry.js';
import { pluginCollectionManager } from './collection-manager.js';
import {
  entryService,
  contentTypeService,
  taxonomyService,
  termService,
  userService,
} from '../services/index.js';

/**
 * Create a Plugin API instance for a specific plugin
 * @param pluginName - Name of the plugin
 * @param settings - Plugin settings from configuration
 */
export function createPluginAPI(
  pluginName: string,
  settings: Record<string, unknown>
): PluginAPI {
  // ============================================================================
  // Hook Registrar
  // ============================================================================
  const hooks: HookRegistrar = {
    on<T extends HookName>(hookName: T, handler: HookHandler<T>, priority?: number): void {
      hookSystem.register(hookName, pluginName, handler, priority);
    },
    off<T extends HookName>(hookName: T, handler: HookHandler<T>): void {
      hookSystem.unregister(hookName, pluginName, handler);
    },
  };

  // ============================================================================
  // Route Registrar
  // ============================================================================
  const routes: RouteRegistrar = {
    register(router: Hono): void {
      routeRegistry.register(pluginName, router);
    },
    getBasePath(): string {
      return `/api/plugins/${pluginName}`;
    },
  };

  // ============================================================================
  // MCP Registrar
  // ============================================================================
  const mcp: MCPRegistrar = {
    registerTool(name: string, tool: MCPToolDefinition): void {
      // Prefix tool name with plugin name for namespacing
      const fullName = `${pluginName}_${name}`;
      mcpToolRegistry.register(fullName, tool, pluginName);
    },
    unregisterTool(name: string): void {
      const fullName = `${pluginName}_${name}`;
      mcpToolRegistry.unregister(fullName);
    },
  };

  // ============================================================================
  // Database Registrar
  // ============================================================================
  const database: DatabaseRegistrar = {
    createCollection<T extends object>(config: CollectionConfig<T>) {
      // Prefix collection name with plugin name
      const fullName = `plugin_${pluginName}_${config.name}`;
      return pluginCollectionManager.create<T>(
        { ...config, name: fullName },
        pluginName
      );
    },
    getCollection<T extends object>(name: string) {
      const fullName = `plugin_${pluginName}_${name}`;
      return pluginCollectionManager.get<T>(fullName);
    },
    dropCollection(name: string): void {
      const fullName = `plugin_${pluginName}_${name}`;
      pluginCollectionManager.drop(fullName);
    },
  };

  // ============================================================================
  // Content Type Registrar
  // ============================================================================
  const contentTypes: ContentTypeRegistrar = {
    async register(contentType: ContentTypeRegistration): Promise<void> {
      // Add plugin prefix to prevent collisions
      const prefixedSlug = `${pluginName}-${contentType.slug}`;

      // Check if already exists
      const existing = await contentTypeService.findBySlug(prefixedSlug);
      if (existing) {
        console.log(`[PluginAPI] Content type '${prefixedSlug}' already exists, skipping`);
        return;
      }

      await contentTypeService.create({
        name: contentType.name,
        slug: prefixedSlug,
        description: contentType.description
          ? `[Plugin: ${pluginName}] ${contentType.description}`
          : `[Plugin: ${pluginName}]`,
        fields: contentType.fields.map((field) => ({
          name: field.name,
          label: field.label,
          type: field.type as any,
          required: field.required ?? false,
          description: field.description,
          defaultValue: field.defaultValue,
          validation: field.validation,
          options: field.options,
        })),
        titleField: contentType.titleField,
      });

      console.log(`[PluginAPI] Registered content type: ${prefixedSlug}`);
    },

    async unregister(slug: string): Promise<void> {
      const prefixedSlug = `${pluginName}-${slug}`;
      const existing = await contentTypeService.findBySlug(prefixedSlug);
      if (existing) {
        await contentTypeService.delete(existing.id);
        console.log(`[PluginAPI] Unregistered content type: ${prefixedSlug}`);
      }
    },
  };

  // ============================================================================
  // Config Accessor
  // ============================================================================
  const config: ConfigAccessor = {
    get<T = unknown>(key: string, defaultValue?: T): T {
      const value = settings[key];
      return (value !== undefined ? value : defaultValue) as T;
    },
    getAll(): Record<string, unknown> {
      return { ...settings };
    },
  };

  // ============================================================================
  // Logger
  // ============================================================================
  const logger: PluginLogger = {
    debug(message: string, ...args: unknown[]): void {
      console.debug(`[Plugin:${pluginName}]`, message, ...args);
    },
    info(message: string, ...args: unknown[]): void {
      console.info(`[Plugin:${pluginName}]`, message, ...args);
    },
    warn(message: string, ...args: unknown[]): void {
      console.warn(`[Plugin:${pluginName}]`, message, ...args);
    },
    error(message: string, ...args: unknown[]): void {
      console.error(`[Plugin:${pluginName}]`, message, ...args);
    },
  };

  // ============================================================================
  // Services Facade
  // ============================================================================
  const services: PluginServices = {
    entries: {
      create: entryService.create.bind(entryService),
      findById: entryService.findById.bind(entryService),
      findBySlug: entryService.findBySlug.bind(entryService),
      findAll: entryService.findAll.bind(entryService),
      update: entryService.update.bind(entryService),
      delete: entryService.delete.bind(entryService),
      publish: entryService.publish.bind(entryService),
      unpublish: entryService.unpublish.bind(entryService),
    },
    contentTypes: {
      create: contentTypeService.create.bind(contentTypeService),
      findById: contentTypeService.findById.bind(contentTypeService),
      findBySlug: contentTypeService.findBySlug.bind(contentTypeService),
      findAll: contentTypeService.findAll.bind(contentTypeService),
      update: contentTypeService.update.bind(contentTypeService),
      delete: contentTypeService.delete.bind(contentTypeService),
    },
    taxonomies: {
      create: taxonomyService.create.bind(taxonomyService),
      findById: taxonomyService.findById.bind(taxonomyService),
      findBySlug: taxonomyService.findBySlug.bind(taxonomyService),
      findAll: taxonomyService.findAll.bind(taxonomyService),
      update: taxonomyService.update.bind(taxonomyService),
      delete: taxonomyService.delete.bind(taxonomyService),
    },
    terms: {
      create: termService.create.bind(termService),
      findById: termService.findById.bind(termService),
      findBySlug: termService.findBySlug.bind(termService),
      findByTaxonomy: termService.findByTaxonomy.bind(termService),
      update: termService.update.bind(termService),
      delete: termService.delete.bind(termService),
    },
    users: {
      findById: userService.findById.bind(userService),
      findByEmail: userService.findByEmail.bind(userService),
      findAll: userService.findAll.bind(userService),
    },
  };

  // ============================================================================
  // Return Complete API
  // ============================================================================
  return {
    pluginName,
    services,
    hooks,
    routes,
    mcp,
    database,
    contentTypes,
    config,
    logger,
  };
}
