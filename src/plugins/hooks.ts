/**
 * LokiCMS Plugin System - Hook System
 * Type-safe event system for plugin hooks
 */

import type { HookName, HookHandler, HookPayloads } from './types.js';

/**
 * Registered hook with metadata
 */
interface RegisteredHook<T extends HookName> {
  pluginName: string;
  handler: HookHandler<T>;
  priority: number;
}

/**
 * Hook System - manages before/after hooks for all operations
 */
class HookSystem {
  private hooks: Map<HookName, RegisteredHook<HookName>[]> = new Map();

  /**
   * Register a hook handler
   * @param hookName - Name of the hook to listen to
   * @param pluginName - Name of the plugin registering the hook
   * @param handler - Handler function to execute
   * @param priority - Execution priority (lower = earlier, default 10)
   */
  register<T extends HookName>(
    hookName: T,
    pluginName: string,
    handler: HookHandler<T>,
    priority: number = 10
  ): void {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }

    const handlers = this.hooks.get(hookName)!;
    handlers.push({
      pluginName,
      handler: handler as HookHandler<HookName>,
      priority,
    });

    // Sort by priority (lower = earlier)
    handlers.sort((a, b) => a.priority - b.priority);

    console.log(`[HookSystem] Registered hook '${hookName}' from plugin '${pluginName}'`);
  }

  /**
   * Unregister a specific hook handler
   */
  unregister<T extends HookName>(
    hookName: T,
    pluginName: string,
    handler: HookHandler<T>
  ): void {
    const handlers = this.hooks.get(hookName);
    if (!handlers) return;

    const index = handlers.findIndex(
      (h) => h.pluginName === pluginName && h.handler === handler
    );

    if (index !== -1) {
      handlers.splice(index, 1);
      console.log(`[HookSystem] Unregistered hook '${hookName}' from plugin '${pluginName}'`);
    }
  }

  /**
   * Unregister all hooks for a plugin
   */
  unregisterAll(pluginName: string): void {
    let count = 0;
    for (const [hookName, handlers] of this.hooks.entries()) {
      const before = handlers.length;
      const filtered = handlers.filter((h) => h.pluginName !== pluginName);
      count += before - filtered.length;
      this.hooks.set(hookName, filtered);
    }

    if (count > 0) {
      console.log(`[HookSystem] Unregistered ${count} hooks from plugin '${pluginName}'`);
    }
  }

  /**
   * Execute hook handlers in sequence
   * Handlers can modify the payload, which is passed to subsequent handlers
   * @returns The potentially modified payload
   */
  async execute<T extends HookName>(
    hookName: T,
    payload: HookPayloads[T]
  ): Promise<HookPayloads[T]> {
    const handlers = this.hooks.get(hookName);
    if (!handlers || handlers.length === 0) {
      return payload;
    }

    let currentPayload = payload;

    for (const { handler, pluginName } of handlers) {
      try {
        const result = await handler(currentPayload);
        // If handler returns a value, use it as the new payload
        if (result !== undefined && result !== null) {
          currentPayload = result as HookPayloads[T];
        }
      } catch (error) {
        console.error(
          `[HookSystem] Error in hook '${hookName}' from plugin '${pluginName}':`,
          error
        );
        // Continue with other handlers - one plugin's error shouldn't break others
      }
    }

    return currentPayload;
  }

  /**
   * Check if any handlers are registered for a hook
   */
  hasHandlers(hookName: HookName): boolean {
    const handlers = this.hooks.get(hookName);
    return handlers !== undefined && handlers.length > 0;
  }

  /**
   * Get count of handlers for a hook
   */
  getHandlerCount(hookName: HookName): number {
    return this.hooks.get(hookName)?.length ?? 0;
  }

  /**
   * Get all registered hook names
   */
  getRegisteredHooks(): HookName[] {
    return Array.from(this.hooks.keys()).filter(
      (hook) => this.hooks.get(hook)!.length > 0
    );
  }

  /**
   * Get handler info for debugging
   */
  getHandlerInfo(hookName: HookName): Array<{ pluginName: string; priority: number }> {
    const handlers = this.hooks.get(hookName);
    if (!handlers) return [];

    return handlers.map(({ pluginName, priority }) => ({ pluginName, priority }));
  }

  /**
   * Clear all hooks (for testing)
   */
  clear(): void {
    this.hooks.clear();
  }
}

// Singleton instance
export const hookSystem = new HookSystem();
