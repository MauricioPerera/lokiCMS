/**
 * LokiCMS Plugin System - Plugin Registry
 * Manages plugin lifecycle, loading, and state
 */

import type {
  RegisteredPlugin,
  PluginDefinition,
  PluginConfig,
  PluginStatus,
  PluginAPI,
} from './types.js';
import { hookSystem } from './hooks.js';
import { mcpToolRegistry } from './mcp-registry.js';
import { routeRegistry } from './route-registry.js';
import { pluginCollectionManager } from './collection-manager.js';
import { createPluginAPI } from './api.js';

/**
 * Plugin Registry - manages all registered plugins
 */
class PluginRegistry {
  private plugins: Map<string, RegisteredPlugin> = new Map();
  private loadOrder: string[] = [];

  /**
   * Register a plugin
   * Creates the plugin API and calls onLoad lifecycle hook
   */
  async register(
    definition: PluginDefinition,
    config: PluginConfig
  ): Promise<RegisteredPlugin> {
    const name = definition.name;

    if (this.plugins.has(name)) {
      throw new Error(`Plugin '${name}' is already registered`);
    }

    // Create plugin API
    const api = createPluginAPI(name, config.settings ?? {});

    const plugin: RegisteredPlugin = {
      name,
      displayName: definition.displayName ?? name,
      version: definition.version,
      description: definition.description,
      status: 'loaded',
      config,
      definition,
      api,
    };

    this.plugins.set(name, plugin);
    this.loadOrder.push(name);

    // Call onLoad lifecycle hook
    if (definition.lifecycle?.onLoad) {
      try {
        await definition.lifecycle.onLoad();
      } catch (error) {
        plugin.status = 'error';
        plugin.error = error instanceof Error ? error : new Error(String(error));
        console.error(`[PluginRegistry] Error in onLoad for '${name}':`, error);
      }
    }

    console.log(`[PluginRegistry] Registered plugin: ${name} v${definition.version}`);
    return plugin;
  }

  /**
   * Enable a plugin - calls setup and lifecycle hooks
   */
  async enable(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin '${name}' not found`);
    }

    if (plugin.status === 'enabled') {
      console.log(`[PluginRegistry] Plugin '${name}' is already enabled`);
      return;
    }

    if (plugin.status === 'error') {
      throw new Error(`Cannot enable plugin '${name}' - it's in error state: ${plugin.error?.message}`);
    }

    try {
      // Run setup function
      await plugin.definition.setup(plugin.api);

      // Call onEnable lifecycle hook
      if (plugin.definition.lifecycle?.onEnable) {
        await plugin.definition.lifecycle.onEnable();
      }

      plugin.status = 'enabled';
      console.log(`[PluginRegistry] Plugin '${name}' enabled successfully`);
    } catch (error) {
      plugin.status = 'error';
      plugin.error = error instanceof Error ? error : new Error(String(error));
      console.error(`[PluginRegistry] Error enabling plugin '${name}':`, error);
      throw error;
    }
  }

  /**
   * Disable a plugin
   */
  async disable(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin '${name}' not found`);
    }

    if (plugin.status === 'disabled') {
      console.log(`[PluginRegistry] Plugin '${name}' is already disabled`);
      return;
    }

    try {
      // Call onDisable lifecycle hook
      if (plugin.definition.lifecycle?.onDisable) {
        await plugin.definition.lifecycle.onDisable();
      }

      // Unregister all resources for this plugin
      hookSystem.unregisterAll(name);
      mcpToolRegistry.unregisterByPlugin(name);
      routeRegistry.unregister(name);
      // Note: We don't drop collections on disable, only on uninstall

      plugin.status = 'disabled';
      console.log(`[PluginRegistry] Plugin '${name}' disabled`);
    } catch (error) {
      plugin.status = 'error';
      plugin.error = error instanceof Error ? error : new Error(String(error));
      console.error(`[PluginRegistry] Error disabling plugin '${name}':`, error);
      throw error;
    }
  }

  /**
   * Uninstall a plugin completely
   */
  async uninstall(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin '${name}' not found`);
    }

    try {
      // Disable first if enabled
      if (plugin.status === 'enabled') {
        await this.disable(name);
      }

      // Call onUninstall lifecycle hook
      if (plugin.definition.lifecycle?.onUninstall) {
        await plugin.definition.lifecycle.onUninstall();
      }

      // Drop plugin collections
      pluginCollectionManager.dropByPlugin(name);

      // Remove from registry
      this.plugins.delete(name);
      this.loadOrder = this.loadOrder.filter((n) => n !== name);

      console.log(`[PluginRegistry] Plugin '${name}' uninstalled`);
    } catch (error) {
      console.error(`[PluginRegistry] Error uninstalling plugin '${name}':`, error);
      throw error;
    }
  }

  /**
   * Get a plugin by name
   */
  get(name: string): RegisteredPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get all registered plugins
   */
  getAll(): RegisteredPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get all enabled plugins
   */
  getEnabled(): RegisteredPlugin[] {
    return this.getAll().filter((p) => p.status === 'enabled');
  }

  /**
   * Get all plugins with errors
   */
  getWithErrors(): RegisteredPlugin[] {
    return this.getAll().filter((p) => p.status === 'error');
  }

  /**
   * Get plugins in load order
   */
  getInLoadOrder(): RegisteredPlugin[] {
    return this.loadOrder
      .map((name) => this.plugins.get(name))
      .filter((p): p is RegisteredPlugin => p !== undefined);
  }

  /**
   * Check if a plugin is registered
   */
  has(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Check if a plugin is enabled
   */
  isEnabled(name: string): boolean {
    const plugin = this.plugins.get(name);
    return plugin?.status === 'enabled';
  }

  /**
   * Update plugin status
   */
  setStatus(name: string, status: PluginStatus, error?: Error): void {
    const plugin = this.plugins.get(name);
    if (plugin) {
      plugin.status = status;
      plugin.error = error;
    }
  }

  /**
   * Get plugin count
   */
  get count(): number {
    return this.plugins.size;
  }

  /**
   * Get count of enabled plugins
   */
  get enabledCount(): number {
    return this.getEnabled().length;
  }

  /**
   * Clear all plugins (for testing)
   */
  clear(): void {
    this.plugins.clear();
    this.loadOrder = [];
  }

  /**
   * Get plugin summary for debugging
   */
  getSummary(): { total: number; enabled: number; disabled: number; errors: number } {
    const all = this.getAll();
    return {
      total: all.length,
      enabled: all.filter((p) => p.status === 'enabled').length,
      disabled: all.filter((p) => p.status === 'disabled').length,
      errors: all.filter((p) => p.status === 'error').length,
    };
  }
}

// Singleton instance
export const pluginRegistry = new PluginRegistry();
