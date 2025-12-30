/**
 * PM2 Ecosystem Configuration for LokiCMS
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs              # Start all apps
 *   pm2 start ecosystem.config.cjs --only api   # Start only API
 *   pm2 restart lokicms-api                     # Restart API
 *   pm2 logs lokicms-api                        # View logs
 *   pm2 monit                                   # Monitor dashboard
 */

module.exports = {
  apps: [
    {
      name: 'lokicms-api',
      script: 'dist/api/index.js',
      interpreter: 'bun',
      cwd: '/root/lokiCMS',

      // Environment
      env: {
        NODE_ENV: 'production',
        PORT: 3005,
        HOST: 'localhost',
        DB_PATH: './data/cms.db',
      },

      // Process management
      instances: 1,              // Single instance (LokiJS is not cluster-safe)
      exec_mode: 'fork',         // Fork mode for single instance
      autorestart: true,         // Auto restart on crash
      watch: false,              // Don't watch files in production
      max_memory_restart: '200M', // Restart if memory exceeds 200MB

      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/root/lokiCMS/logs/error.log',
      out_file: '/root/lokiCMS/logs/out.log',
      merge_logs: true,

      // Graceful shutdown
      kill_timeout: 5000,        // 5 seconds to gracefully shutdown
      listen_timeout: 10000,     // 10 seconds to wait for app ready

      // Health monitoring
      min_uptime: '10s',         // Consider started after 10s
      max_restarts: 10,          // Max 10 restarts in a row
    },

    // MCP Server (optional, for AI integrations)
    {
      name: 'lokicms-mcp',
      script: 'dist/mcp/index.js',
      interpreter: 'bun',
      cwd: '/root/lokiCMS',

      env: {
        NODE_ENV: 'production',
        DB_PATH: './data/cms.db',
      },

      // Disabled by default - start manually when needed
      autorestart: false,
      watch: false,

      // Logging
      error_file: '/root/lokiCMS/logs/mcp-error.log',
      out_file: '/root/lokiCMS/logs/mcp-out.log',
    },
  ],
};
