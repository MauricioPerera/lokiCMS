/**
 * LokiCMS - Main Entry Point
 * Starts both API server and MCP server based on arguments
 */

import { loadAllPlugins, hookSystem } from './plugins/index.js';

const args = process.argv.slice(2);
const mode = args[0] || 'api';

async function main() {
  // Load plugins before starting any server
  // Skip plugin loading for seed mode to avoid circular dependencies
  if (mode !== 'seed') {
    console.log('Loading plugins...');
    await loadAllPlugins();
  }

  switch (mode) {
    case 'api':
      console.log('Starting API server...');
      await import('./api/index.js');
      break;

    case 'mcp':
      console.log('Starting MCP server...');
      await import('./mcp/index.js');
      break;

    case 'seed':
      console.log('Running database seed...');
      await import('./seed.js');
      break;

    default:
      console.log(`
LokiCMS - Headless CMS with LokiJS

Usage:
  npm run start           Start API server (default)
  npm run start:api       Start API server
  npm run start:mcp       Start MCP server
  npm run dev             Start API server in development mode
  npm run dev:mcp         Start MCP server in development mode
  npm run seed            Seed the database with initial data

Environment variables:
  PORT          API server port (default: 3000)
  HOST          API server host (default: localhost)
  DB_PATH       Database file path (default: ./data/cms.db)
  JWT_SECRET    Secret key for JWT tokens
  JWT_EXPIRES_IN Token expiration (default: 7d)
`);
      break;
  }

  // Emit system:ready hook after server starts
  if (mode === 'api' || mode === 'mcp') {
    await hookSystem.execute('system:ready', {});
  }
}

// Handle graceful shutdown
const shutdown = async () => {
  console.log('\nShutting down gracefully...');
  await hookSystem.execute('system:shutdown', {});
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch(console.error);
