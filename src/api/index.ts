/**
 * API Server
 * Main Hono application with all routes
 *
 * Optimizations:
 * - HTTP compression (gzip/deflate)
 * - Response caching with ETags
 * - Conditional logging (disabled in production)
 * - Bun-native server support
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { compress } from 'hono/compress';
import { etag } from 'hono/etag';
import { timing } from 'hono/timing';

// Note: @hono/node-server is dynamically imported only when running on Node.js

import { initDatabase, closeDatabase, saveDatabase } from '../db/index.js';
import { authRoutes } from './routes/auth.js';
import { contentTypeRoutes } from './routes/content-types.js';
import { entryRoutes } from './routes/entries.js';
import { taxonomyRoutes } from './routes/taxonomies.js';
import { termRoutes } from './routes/terms.js';
import { userRoutes } from './routes/users.js';
import { searchRoutes } from './routes/search.js';
import { schedulerRoutes } from './routes/scheduler.js';
import { auditRoutes } from './routes/audit.js';
import { routeRegistry, pluginRegistry, loadAllPlugins } from '../plugins/index.js';
import { schedulerService } from '../services/scheduler.service.js';
import { auditService } from '../services/audit.service.js';

// Environment detection
const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';
const IS_BUN = typeof globalThis.Bun !== 'undefined';

// Create Hono app
const app = new Hono();

// =============================================================================
// Global Middleware (order matters!)
// =============================================================================

// 1. Server Timing (performance metrics)
app.use('*', timing());

// 2. Compression (gzip/deflate) - major bandwidth savings
app.use('*', compress());

// 3. ETag support for caching
app.use('*', etag());

// 4. Logging (conditional in production for performance)
if (!IS_PRODUCTION) {
  app.use('*', logger());
  app.use('*', prettyJSON());
}

// 5. Security headers
app.use('*', secureHeaders());

// 6. CORS
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['X-Total-Count', 'Server-Timing'],
  maxAge: 86400,
}));

// 7. Cache headers for read endpoints
app.use('/api/entries/*', async (c, next) => {
  await next();
  if (c.req.method === 'GET' && c.res.status === 200) {
    c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  }
});

app.use('/api/content-types/*', async (c, next) => {
  await next();
  if (c.req.method === 'GET' && c.res.status === 200) {
    c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  }
});

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'LokiCMS API',
    version: '1.0.0',
    status: 'running',
    runtime: IS_BUN ? 'bun' : 'node',
    mode: IS_PRODUCTION ? 'production' : 'development',
  });
});

app.get('/health', (c) => {
  const memUsage = process.memoryUsage();
  return c.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: Math.floor(process.uptime()),
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
    },
    runtime: IS_BUN ? 'bun' : 'node',
  });
});

// API routes
app.route('/api/auth', authRoutes);
app.route('/api/content-types', contentTypeRoutes);
app.route('/api/entries', entryRoutes);
app.route('/api/taxonomies', taxonomyRoutes);
app.route('/api/terms', termRoutes);
app.route('/api/users', userRoutes);
app.route('/api/search', searchRoutes);
app.route('/api/scheduler', schedulerRoutes);
app.route('/api/audit', auditRoutes);

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

// Optimized autosave interval based on environment
const AUTOSAVE_INTERVAL = IS_PRODUCTION ? 30000 : 5000;

// Start server
async function startServer() {
  const startTime = performance.now();

  try {
    // Initialize database
    console.log('Initializing database...');
    await initDatabase({
      path: DB_PATH,
      autosave: true,
      autosaveInterval: AUTOSAVE_INTERVAL,
    });
    console.log('Database initialized');

    // Initialize audit log
    await auditService.initialize();

    // Load plugins
    console.log('Loading plugins...');
    await loadAllPlugins();

    // Register plugin routes
    registerPluginRoutes();

    // Start scheduler for scheduled entries
    schedulerService.start();
    console.log('[Scheduler] Started');

    // Start HTTP server based on runtime
    if (IS_BUN) {
      // Bun-native server (faster, lower memory)
      const server = Bun.serve({
        fetch: app.fetch,
        port: PORT,
        hostname: HOST,
      });
      console.log(`[Bun] Server running at http://${HOST}:${PORT}`);
    } else {
      // Node.js server
      const { serve } = await import('@hono/node-server');
      serve({
        fetch: app.fetch,
        port: PORT,
        hostname: HOST,
      });
      console.log(`[Node] Server running at http://${HOST}:${PORT}`);
    }

    const startupTime = Math.round(performance.now() - startTime);
    console.log(`✓ Startup completed in ${startupTime}ms`);
    console.log(`  Mode: ${IS_PRODUCTION ? 'production' : 'development'}`);
    console.log(`  Runtime: ${IS_BUN ? 'Bun' : 'Node.js'}`);
    console.log(`  Compression: enabled`);
    console.log(`  ETag caching: enabled`);

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\nShutting down gracefully...');
      schedulerService.stop();
      await saveDatabase();
      await closeDatabase();
      console.log('Database saved. Goodbye!');
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
