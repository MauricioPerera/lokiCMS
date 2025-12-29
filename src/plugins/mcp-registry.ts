/**
 * LokiCMS Plugin System - MCP Tool Registry
 * Registry for MCP tools registered by plugins
 */

import type { MCPToolDefinition } from './types.js';

/**
 * Registered tool with metadata
 */
interface RegisteredTool {
  pluginName: string;
  tool: MCPToolDefinition;
}

/**
 * MCP Tool Registry - manages tools registered by plugins
 */
class MCPToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  /**
   * Register an MCP tool
   * @param name - Tool name (will be namespaced by plugin)
   * @param tool - Tool definition
   * @param pluginName - Name of the registering plugin
   */
  register(name: string, tool: MCPToolDefinition, pluginName: string): void {
    if (this.tools.has(name)) {
      console.warn(`[MCPToolRegistry] Tool '${name}' already registered, overwriting`);
    }
    this.tools.set(name, { pluginName, tool });
    console.log(`[MCPToolRegistry] Registered tool: ${name} (from ${pluginName})`);
  }

  /**
   * Unregister a tool by name
   */
  unregister(name: string): void {
    if (this.tools.delete(name)) {
      console.log(`[MCPToolRegistry] Unregistered tool: ${name}`);
    }
  }

  /**
   * Unregister all tools from a plugin
   */
  unregisterByPlugin(pluginName: string): void {
    const toRemove: string[] = [];
    for (const [name, { pluginName: pn }] of this.tools.entries()) {
      if (pn === pluginName) {
        toRemove.push(name);
      }
    }
    for (const name of toRemove) {
      this.tools.delete(name);
    }
    if (toRemove.length > 0) {
      console.log(`[MCPToolRegistry] Unregistered ${toRemove.length} tools from plugin '${pluginName}'`);
    }
  }

  /**
   * Get a tool by name
   */
  get(name: string): MCPToolDefinition | undefined {
    return this.tools.get(name)?.tool;
  }

  /**
   * Get all tools as a record (for merging with core tools)
   */
  getAll(): Record<string, MCPToolDefinition> {
    const result: Record<string, MCPToolDefinition> = {};
    for (const [name, { tool }] of this.tools.entries()) {
      result[name] = tool;
    }
    return result;
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get tools registered by a specific plugin
   */
  getByPlugin(pluginName: string): Record<string, MCPToolDefinition> {
    const result: Record<string, MCPToolDefinition> = {};
    for (const [name, { pluginName: pn, tool }] of this.tools.entries()) {
      if (pn === pluginName) {
        result[name] = tool;
      }
    }
    return result;
  }

  /**
   * Get count of registered tools
   */
  get count(): number {
    return this.tools.size;
  }

  /**
   * Clear all tools (for testing)
   */
  clear(): void {
    this.tools.clear();
  }
}

// Singleton instance
export const mcpToolRegistry = new MCPToolRegistry();
