/**
 * LokiCMS Plugin System
 * Main exports for the plugin system
 */

// Types
export type {
  PluginStatus,
  PluginSource,
  PluginConfig,
  PluginsConfig,
  PluginPackageMetadata,
  PluginPackageJson,
  PluginLifecycle,
  PluginDefinition,
  PluginAPI,
  PluginServices,
  HookRegistrar,
  RouteRegistrar,
  MCPToolDefinition,
  MCPRegistrar,
  CollectionConfig,
  DatabaseRegistrar,
  ContentTypeFieldDefinition,
  ContentTypeRegistration,
  ContentTypeRegistrar,
  ConfigAccessor,
  PluginLogger,
  HookName,
  HookPayloads,
  HookHandler,
  RegisteredPlugin,
} from './types.js';

// Hook System
export { hookSystem } from './hooks.js';

// Plugin Registry
export { pluginRegistry } from './registry.js';

// Plugin Loader
export {
  loadAllPlugins,
  loadPluginsConfig,
  discoverPlugins,
  generatePluginsConfig,
} from './loader.js';

// Plugin API Factory
export { createPluginAPI } from './api.js';

// Registries
export { mcpToolRegistry } from './mcp-registry.js';
export { routeRegistry } from './route-registry.js';
export { pluginCollectionManager } from './collection-manager.js';
