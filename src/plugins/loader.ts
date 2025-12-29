/**
 * LokiCMS Plugin System - Plugin Loader
 * Handles dynamic loading of plugins from npm packages or local paths
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  PluginConfig,
  PluginsConfig,
  PluginDefinition,
  PluginPackageJson,
} from './types.js';
import { pluginRegistry } from './registry.js';

/**
 * Default plugins.json path
 */
const DEFAULT_CONFIG_PATH = './plugins.json';

/**
 * Plugin naming convention prefix
 */
const PLUGIN_PREFIX = 'lokicms-plugin-';

/**
 * Parse environment variable interpolation in config
 * Supports ${ENV_VAR} and ${ENV_VAR:default} syntax
 */
function interpolateEnvVars(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{([^}:]+)(?::([^}]*))?\}/g, (_, envVar, defaultValue) => {
      return process.env[envVar] ?? defaultValue ?? '';
    });
  }

  if (Array.isArray(value)) {
    return value.map(interpolateEnvVars);
  }

  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = interpolateEnvVars(val);
    }
    return result;
  }

  return value;
}

/**
 * Load and parse plugins.json configuration
 */
export async function loadPluginsConfig(
  configPath: string = DEFAULT_CONFIG_PATH
): Promise<PluginsConfig> {
  const resolvedPath = path.resolve(configPath);

  if (!fs.existsSync(resolvedPath)) {
    console.log('[PluginLoader] No plugins.json found, using empty config');
    return { plugins: [] };
  }

  try {
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    const config = JSON.parse(content) as PluginsConfig;

    // Interpolate environment variables in settings
    for (const plugin of config.plugins) {
      if (plugin.settings) {
        plugin.settings = interpolateEnvVars(plugin.settings) as Record<string, unknown>;
      }
    }

    return config;
  } catch (error) {
    console.error('[PluginLoader] Error loading plugins.json:', error);
    return { plugins: [] };
  }
}

/**
 * Resolve plugin module path
 */
async function resolvePluginPath(config: PluginConfig): Promise<string> {
  if (config.source === 'local' && config.path) {
    // Local plugin - resolve relative to cwd
    const localPath = path.resolve(config.path);

    // Check if it's a directory with package.json
    const packageJsonPath = path.join(localPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const mainFile = pkg.main || 'index.js';
      return path.join(localPath, mainFile);
    }

    // Check if it's a direct file path
    if (fs.existsSync(localPath)) {
      return localPath;
    }

    // Try with .js extension
    if (fs.existsSync(localPath + '.js')) {
      return localPath + '.js';
    }

    throw new Error(`Local plugin not found at: ${config.path}`);
  }

  // NPM plugin - use standard resolution
  const packageName = config.name.startsWith(PLUGIN_PREFIX)
    ? config.name
    : config.name;

  return packageName;
}

/**
 * Load a single plugin
 */
async function loadPlugin(config: PluginConfig): Promise<PluginDefinition | null> {
  try {
    const modulePath = await resolvePluginPath(config);
    console.log(`[PluginLoader] Loading plugin '${config.name}' from: ${modulePath}`);

    let module: unknown;

    if (config.source === 'local') {
      // For local files, use file URL
      const fileUrl = pathToFileURL(modulePath).href;
      module = await import(fileUrl);
    } else {
      // For npm packages, use package name
      module = await import(modulePath);
    }

    // Support both default export and named 'plugin' export
    const definition: PluginDefinition =
      (module as any).default ??
      (module as any).plugin ??
      module;

    // Validate plugin definition
    if (!definition || typeof definition.setup !== 'function') {
      throw new Error('Invalid plugin: missing setup function');
    }

    if (!definition.name) {
      throw new Error('Invalid plugin: missing name');
    }

    if (!definition.version) {
      throw new Error('Invalid plugin: missing version');
    }

    return definition;
  } catch (error) {
    console.error(`[PluginLoader] Failed to load plugin '${config.name}':`, error);
    return null;
  }
}

/**
 * Load all plugins from configuration
 */
export async function loadAllPlugins(configPath?: string): Promise<void> {
  const config = await loadPluginsConfig(configPath);

  if (config.plugins.length === 0) {
    console.log('[PluginLoader] No plugins configured');
    return;
  }

  console.log(`[PluginLoader] Loading ${config.plugins.length} plugin(s)...`);

  // Load and register plugins
  for (const pluginConfig of config.plugins) {
    const definition = await loadPlugin(pluginConfig);

    if (!definition) {
      console.error(`[PluginLoader] Skipping plugin '${pluginConfig.name}' due to load error`);
      continue;
    }

    try {
      await pluginRegistry.register(definition, pluginConfig);
    } catch (error) {
      console.error(`[PluginLoader] Failed to register plugin '${pluginConfig.name}':`, error);
    }
  }

  // Enable plugins that should be enabled
  for (const pluginConfig of config.plugins) {
    if (!pluginConfig.enabled) {
      console.log(`[PluginLoader] Plugin '${pluginConfig.name}' is disabled in config`);
      continue;
    }

    // Find the registered plugin (might use definition.name instead of config.name)
    const plugin = pluginRegistry.get(pluginConfig.name);

    if (plugin && plugin.status === 'loaded') {
      try {
        await pluginRegistry.enable(plugin.name);
      } catch (error) {
        console.error(`[PluginLoader] Failed to enable plugin '${plugin.name}':`, error);
      }
    }
  }

  const summary = pluginRegistry.getSummary();
  console.log(
    `[PluginLoader] Plugin loading complete: ${summary.enabled} enabled, ${summary.disabled} disabled, ${summary.errors} errors`
  );
}

/**
 * Discover available plugins in node_modules
 * Looks for packages matching the lokicms-plugin-* naming convention
 */
export async function discoverPlugins(): Promise<PluginPackageJson[]> {
  const plugins: PluginPackageJson[] = [];
  const nodeModulesPath = path.resolve('./node_modules');

  if (!fs.existsSync(nodeModulesPath)) {
    return plugins;
  }

  try {
    const entries = fs.readdirSync(nodeModulesPath);

    for (const entry of entries) {
      // Check for direct lokicms-plugin-* packages
      if (entry.startsWith(PLUGIN_PREFIX)) {
        const pkg = await readPackageJson(path.join(nodeModulesPath, entry));
        if (pkg) plugins.push(pkg);
        continue;
      }

      // Check for scoped packages (@scope/lokicms-plugin-*)
      if (entry.startsWith('@')) {
        const scopePath = path.join(nodeModulesPath, entry);
        if (!fs.statSync(scopePath).isDirectory()) continue;

        const scopedEntries = fs.readdirSync(scopePath);
        for (const scopedEntry of scopedEntries) {
          if (scopedEntry.startsWith(PLUGIN_PREFIX)) {
            const pkg = await readPackageJson(path.join(scopePath, scopedEntry));
            if (pkg) plugins.push(pkg);
          }
        }
      }
    }
  } catch (error) {
    console.error('[PluginLoader] Error discovering plugins:', error);
  }

  return plugins;
}

/**
 * Read and parse a package.json file
 */
async function readPackageJson(packagePath: string): Promise<PluginPackageJson | null> {
  const packageJsonPath = path.join(packagePath, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(packageJsonPath, 'utf-8');
    return JSON.parse(content) as PluginPackageJson;
  } catch {
    return null;
  }
}

/**
 * Generate a plugins.json template from discovered plugins
 */
export function generatePluginsConfig(plugins: PluginPackageJson[]): PluginsConfig {
  return {
    plugins: plugins.map((pkg) => ({
      name: pkg.name,
      enabled: false,
      source: 'npm' as const,
      version: pkg.version,
      settings: {},
    })),
  };
}
