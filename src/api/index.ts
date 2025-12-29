/**
 * API Server
 * Main Hono application with all routes
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { serve } from '@hono/node-server';

import { initDatabase, closeDatabase, saveDatabase } from '../db/index.js';
import { authRoutes } from './routes/auth.js';
import { contentTypeRoutes } from './routes/content-types.js';
import { entryRoutes } from './routes/entries.js';
import { taxonomyRoutes } from './routes/taxonomies.js';
import { termRoutes } from './routes/terms.js';
import { userRoutes } from './routes/users.js';
import { routeRegistry, pluginRegistry } from '../plugins/index.js';

// Create Hono app
const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', secureHeaders());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['X-Total-Count'],
  maxAge: 86400,
}));

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'LokiCMS API',
    version: '1.0.0',
    status: 'running',
  });
});

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: Date.now() });
});

// API routes
app.route('/api/auth', authRoutes);
app.route('/api/content-types', contentTypeRoutes);
app.route('/api/entries', entryRoutes);
app.route('/api/taxonomies', taxonomyRoutes);
app.route('/api/terms', termRoutes);
app.route('/api/users', userRoutes);

// Plugin routes - registered dynamically
function registerPluginRoutes() {
  const pluginRoutes = routeRegistry.getAll();
  for (const [pluginName, { router }] of pluginRoutes.entries()) {
    const basePath = `/api/plugins/${pluginName}`;
    app.route(basePath, router);
    console.log(`[API] Registered plugin routes at ${basePath}`);
  }
}

// Plugin listing endpoint
app.get('/api/plugins', (c) => {
  const plugins = pluginRegistry.getAll().map((p) => ({
    name: p.name,
    displayName: p.displayName,
    version: p.version,
    status: p.status,
    description: p.description,
    hasRoutes: routeRegistry.has(p.name),
  }));
  return c.json({ plugins });
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('API Error:', err);
  return c.json({ error: err.message || 'Internal server error' }, 500);
});

// Server configuration
const PORT = parseInt(process.env['PORT'] || '3000', 10);
const HOST = process.env['HOST'] || 'localhost';
const DB_PATH = process.env['DB_PATH'] || './data/cms.db';

// Start server
async function startServer() {
  try {
    // Initialize database
    console.log('Initializing database...');
    await initDatabase({
      path: DB_PATH,
      autosave: true,
      autosaveInterval: 5000,
    });
    console.log('Database initialized');

    // Register plugin routes
    registerPluginRoutes();

    // Start HTTP server
    const server = serve({
      fetch: app.fetch,
      port: PORT,
      hostname: HOST,
    });

    console.log(`API server running at http://${HOST}:${PORT}`);

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\nShutting down...');
      await saveDatabase();
      await closeDatabase();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Export for testing
export { app };

// Start if run directly
startServer();
