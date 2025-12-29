/**
 * LokiCMS Plugin System - Route Registry
 * Registry for API routes registered by plugins
 */

import type { Hono } from 'hono';

/**
 * Registered route with metadata
 */
interface RegisteredRoute {
  pluginName: string;
  router: Hono;
}

/**
 * Route Registry - manages API routes registered by plugins
 */
class RouteRegistry {
  private routes: Map<string, RegisteredRoute> = new Map();

  /**
   * Register routes for a plugin
   * @param pluginName - Name of the plugin
   * @param router - Hono router instance
   */
  register(pluginName: string, router: Hono): void {
    if (this.routes.has(pluginName)) {
      console.warn(`[RouteRegistry] Routes for '${pluginName}' already registered, overwriting`);
    }
    this.routes.set(pluginName, { pluginName, router });
    console.log(`[RouteRegistry] Registered routes for plugin: ${pluginName}`);
  }

  /**
   * Unregister routes for a plugin
   */
  unregister(pluginName: string): void {
    if (this.routes.delete(pluginName)) {
      console.log(`[RouteRegistry] Unregistered routes for plugin: ${pluginName}`);
    }
  }

  /**
   * Get all registered routes
   */
  getAll(): Map<string, RegisteredRoute> {
    return new Map(this.routes);
  }

  /**
   * Get routes for a specific plugin
   */
  get(pluginName: string): Hono | undefined {
    return this.routes.get(pluginName)?.router;
  }

  /**
   * Check if a plugin has registered routes
   */
  has(pluginName: string): boolean {
    return this.routes.has(pluginName);
  }

  /**
   * Get all plugin names with registered routes
   */
  getPluginNames(): string[] {
    return Array.from(this.routes.keys());
  }

  /**
   * Get count of plugins with routes
   */
  get count(): number {
    return this.routes.size;
  }

  /**
   * Clear all routes (for testing)
   */
  clear(): void {
    this.routes.clear();
  }
}

// Singleton instance
export const routeRegistry = new RouteRegistry();
