# LokiCMS - AI Agent Documentation

## Overview

**LokiCMS** is a **hackeable, AI-first headless CMS** built for AI agent integration via Model Context Protocol (MCP).

| Aspect | Details |
|--------|---------|
| **Type** | Headless Content Management System |
| **Database** | LokiJS (embedded document database) |
| **API** | Hono framework (REST) |
| **AI Integration** | MCP (Model Context Protocol) |
| **Language** | TypeScript (ES Modules) |
| **Runtime** | Node.js or Bun (auto-detected) |
| **Auth** | JWT tokens + API keys |

### Execution Modes

```bash
npm run dev          # REST API server (development)
npm run dev:mcp      # MCP server (stdio transport)
npm run seed         # Initialize database with sample data
npm run prod         # Build + start production (Node.js)
npm run prod:bun     # Build + start production (Bun)
```

---

## Quick Start

```bash
# Install dependencies
npm install

# Development
npm run dev              # Start API server
npm run dev:mcp          # Start MCP server

# Production
npm run prod             # Build + start (Node.js)
npm run prod:bun         # Build + start (Bun - faster)
npm run start:bun        # Start with Bun runtime

# Database
npm run seed             # Seed with sample data
npm run export:structure # Export structure to JSON
npm run import:structure # Import structure from JSON

# Testing
npm run test:run         # Run all tests (718 tests)
npm run test:watch       # Watch mode

# Build
npm run build            # Compile TypeScript to dist/
```

### CLI Management (Production)

```bash
./lokicms start      # Start with PM2
./lokicms stop       # Stop server
./lokicms restart    # Restart server
./lokicms status     # Status + health check
./lokicms logs [n]   # View last n log lines
./lokicms monit      # PM2 monitoring dashboard
./lokicms backup     # Backup data + config
./lokicms update     # Git pull + build + restart
```

---

## Architecture

```
src/
├── index.ts              # Main entry (CLI router)
├── api/
│   ├── index.ts          # Hono API server
│   ├── routes/           # REST endpoints
│   └── middleware/       # Auth, validation
├── mcp/
│   ├── index.ts          # MCP server
│   └── tools/            # MCP tools (29 tools)
├── services/             # Business logic layer
├── models/               # Zod schemas
├── db/
│   └── index.ts          # Database singleton
├── lib/lokijs/           # LokiJS implementation
├── plugins/              # Plugin system
└── scripts/              # CLI utilities
```

### Data Flow

```
Request → Middleware (auth/validation) → Service → Database (LokiJS)
                                              ↓
                                         Response
```

### Entry Points

| File | Purpose |
|------|---------|
| `src/index.ts` | CLI mode router (api/mcp/seed) |
| `src/api/index.ts` | REST API server |
| `src/mcp/index.ts` | MCP server for AI agents |

---

## Key Files

| File | Purpose |
|------|---------|
| `src/db/index.ts` | Database singleton, collections access |
| `src/services/contentType.service.ts` | Content type CRUD |
| `src/services/entry.service.ts` | Entry CRUD with filtering |
| `src/services/taxonomy.service.ts` | Taxonomy management |
| `src/services/term.service.ts` | Term management |
| `src/services/user.service.ts` | User auth and management |
| `src/models/contentType.model.ts` | ContentType Zod schema |
| `src/models/entry.model.ts` | Entry Zod schema |
| `src/models/taxonomy.model.ts` | Taxonomy/Term schemas |
| `src/models/user.model.ts` | User Zod schema |
| `src/api/routes/entries.ts` | Entry REST endpoints |
| `src/api/routes/content-types.ts` | ContentType endpoints |
| `src/mcp/tools/content.ts` | Content MCP tools |
| `src/mcp/tools/taxonomy.ts` | Taxonomy MCP tools |
| `src/mcp/tools/users.ts` | User MCP tools |
| `src/mcp/tools/structure.ts` | Structure migration tools |
| `src/plugins/loader.ts` | Plugin loading system |
| `src/plugins/hooks.ts` | Hook system (25 hooks) |

---

## Data Models

### ContentType
Defines the structure of content entries.

```typescript
interface ContentType {
  id: string;
  name: string;           // Display name
  slug: string;           // URL-safe identifier (unique)
  description?: string;
  fields: Field[];        // Field definitions
  titleField: string;     // Field used as title (default: 'title')
  enableVersioning: boolean;  // Track versions
  enableDrafts: boolean;      // Allow draft status
  enableScheduling: boolean;  // Allow scheduled publishing
  icon?: string;          // Icon identifier
  createdAt: number;
  updatedAt: number;
}

interface Field {
  name: string;           // Field identifier
  label: string;          // Display label
  type: FieldType;        // See supported types below
  required?: boolean;
  unique?: boolean;
  defaultValue?: unknown;
  description?: string;
  validation?: {
    min?: number;         // Min length/value
    max?: number;         // Max length/value
    pattern?: string;     // Regex pattern
    options?: string[];   // For select/multiselect
  };
  relationTo?: string;    // For relation fields
  relationMultiple?: boolean;  // Multiple relations
}
```

**Supported Field Types (17):**
| Type | Description |
|------|-------------|
| `text` | Single line text |
| `textarea` | Multi-line text |
| `richtext` | HTML rich text |
| `markdown` | Markdown text |
| `number` | Numeric value |
| `boolean` | True/false |
| `date` | Date only |
| `datetime` | Date and time |
| `time` | Time only (HH:MM:SS) |
| `email` | Email address |
| `url` | URL |
| `slug` | URL-safe slug |
| `color` | Hex color (#RGB, #RRGGBB, #RRGGBBAA) |
| `select` | Single selection |
| `multiselect` | Multiple selections |
| `relation` | Reference to other entries |
| `media` | Media file reference |
| `json` | JSON object |

**Content Validation:**
```typescript
import { validateContentAgainstType } from './models/content-type.js';

const result = validateContentAgainstType(entryData, contentType);
// result: { valid: boolean, errors: string[] }
```

### Entry
Instance of content based on a ContentType.

```typescript
interface Entry {
  id: string;
  contentTypeId: string;  // References ContentType
  status: 'draft' | 'published' | 'archived' | 'scheduled';
  data: Record<string, unknown>;  // Field values
  taxonomies?: Record<string, string[]>;  // taxonomy slug → term IDs
  author?: string;
  publishedAt?: number;
  scheduledAt?: number;   // For scheduled publishing
  createdAt: number;
  updatedAt: number;
}
```

### Taxonomy & Term
Categorization system.

```typescript
interface Taxonomy {
  id: string;
  name: string;
  slug: string;           // unique
  description?: string;
  hierarchical: boolean;  // true = categories, false = tags
  createdAt: number;
  updatedAt: number;
}

interface Term {
  id: string;
  taxonomyId: string;
  name: string;
  slug: string;           // unique within taxonomy
  description?: string;
  parentId?: string;      // For hierarchical taxonomies
  createdAt: number;
  updatedAt: number;
}
```

### User
Authentication and authorization.

```typescript
interface User {
  id: string;
  email: string;          // unique
  username: string;       // unique
  passwordHash: string;
  role: 'admin' | 'editor' | 'author' | 'viewer';
  status: 'active' | 'inactive' | 'suspended';
  apiKey?: string;
  createdAt: number;
  updatedAt: number;
}
```

---

## Services Layer

All services are singletons accessible via imports.

### contentTypeService
```typescript
import { contentTypeService } from './services/contentType.service.js';

contentTypeService.create(data)      // Create content type
contentTypeService.getById(id)       // Get by ID
contentTypeService.getBySlug(slug)   // Get by slug
contentTypeService.list(options)     // List with pagination
contentTypeService.update(id, data)  // Update
contentTypeService.delete(id)        // Delete
```

### entryService
```typescript
import { entryService } from './services/entry.service.js';

entryService.create(data)            // Create entry
entryService.getById(id)             // Get by ID
entryService.list(options)           // List with filters, pagination, sorting
entryService.update(id, data)        // Update
entryService.delete(id)              // Delete
entryService.publish(id)             // Set status to published
entryService.unpublish(id)           // Set status to draft
entryService.archive(id)             // Set status to archived
```

### taxonomyService / termService
```typescript
import { taxonomyService } from './services/taxonomy.service.js';
import { termService } from './services/term.service.js';

taxonomyService.create(data)
taxonomyService.getBySlug(slug)
termService.create(data)
termService.getByTaxonomy(taxonomyId)
```

### userService
```typescript
import { userService } from './services/user.service.js';

userService.create(data)             // Create user (hashes password)
userService.authenticate(email, pw)  // Returns user or null
userService.generateToken(userId)    // JWT token
userService.verifyToken(token)       // Decode and verify
userService.generateApiKey(userId)   // Create API key
userService.verifyApiKey(key)        // Validate API key
```

### searchService
```typescript
import { searchService } from './services/search.service.js';

searchService.search({ query, types, contentTypes, status, limit })
searchService.searchInContentType(slug, query, options)
searchService.suggest(query, limit)  // Autocomplete suggestions
```

### schedulerService
```typescript
import { schedulerService } from './services/scheduler.service.js';

schedulerService.start()             // Start background worker
schedulerService.stop()              // Stop scheduler
schedulerService.getStats()          // Get status and stats
schedulerService.getUpcoming(limit)  // Get scheduled entries
schedulerService.scheduleEntry(id, timestamp)  // Schedule for publishing
schedulerService.cancelSchedule(id)  // Cancel scheduled publish
```

### auditService
```typescript
import { auditService } from './services/audit.service.js';

auditService.log({ action, resource, resourceId, ... })
auditService.query(filters, pagination)
auditService.getResourceHistory(resource, id)
auditService.getUserActivity(userId)
auditService.getRecentActivity(limit)
auditService.getStats()
```

### revisionService
```typescript
import { revisionService } from './services/revision.service.js';

revisionService.getRevisions(entryId, limit)   // Get entry revisions
revisionService.getRevision(revisionId)        // Get specific revision
revisionService.compareRevisions(id1, id2)     // Diff two revisions
revisionService.getStats()                     // Statistics
// Auto-tracks via hooks: create, update, publish, unpublish
```

### webhookService
```typescript
import { webhookService } from './services/webhook.service.js';

webhookService.create({ name, url, events, secret })
webhookService.list()                          // List webhooks
webhookService.trigger(event, payload)         // Trigger manually
webhookService.test(webhookId)                 // Test webhook
webhookService.getStats()
// Events: entry:*, user:*, content-type:*
```

### backupService
```typescript
import { backupService } from './services/backup.service.js';

backupService.createBackup({ description })    // Create backup
backupService.listBackups()                    // List available
backupService.restoreFromBackup(id, options)   // Restore
backupService.getStats()
// Options: { includeUsers, mergeMode: 'replace'|'merge'|'skip' }
```

---

## API Routes

Base URL: `http://localhost:3000/api` (dev) or `http://localhost:3005/api` (prod)

### API Optimizations
- **Compression**: gzip/deflate enabled
- **ETag caching**: Automatic for GET requests
- **Cache-Control**: 60s entries, 300s content-types
- **Security headers**: Enabled via Hono
- **Server-Timing**: Performance metrics in headers

### Pattern
```
GET    /api/{resource}              # List all
POST   /api/{resource}              # Create
GET    /api/{resource}/id/:id       # Get by ID
PUT    /api/{resource}/id/:id       # Update
DELETE /api/{resource}/id/:id       # Delete
GET    /api/{resource}/slug/:slug   # Get by slug (where applicable)
```

### Endpoints

| Resource | Endpoints |
|----------|-----------|
| `/api/content-types` | CRUD for content types |
| `/api/entries` | CRUD for entries + publish/unpublish/archive |
| `/api/entries?contentType=slug` | Filter entries by content type |
| `/api/entries?status=published` | Filter by status |
| `/api/taxonomies` | CRUD for taxonomies |
| `/api/terms` | CRUD for terms |
| `/api/users` | User management |
| `/api/auth/login` | POST - authenticate, get JWT |
| `/api/auth/register` | POST - create user |
| `/api/plugins` | GET - list loaded plugins |
| `/api/search?q=query` | Full-text search across content |
| `/api/search/suggest?q=partial` | Search suggestions |
| `/api/search/:contentType?q=query` | Search within content type |
| `/api/scheduler` | Scheduler status and management |
| `/api/audit` | Audit log queries |
| `/api/revisions/:entryId` | Entry revision history |
| `/api/webhooks` | Webhook CRUD and management |
| `/api/backup` | Backup create, list, restore |
| `/health` | GET - health check + memory stats |

### Authentication

```bash
# JWT Token (header)
Authorization: Bearer <token>

# API Key (header)
X-API-Key: <key>
```

---

## MCP Tools

51 tools available for AI agents via MCP protocol.

### Content Management (10 tools)
| Tool | Description |
|------|-------------|
| `create_content_type` | Create a new content type |
| `get_content_type` | Get content type by ID or slug |
| `list_content_types` | List all content types |
| `update_content_type` | Update content type |
| `delete_content_type` | Delete content type |
| `create_entry` | Create a new entry |
| `get_entry` | Get entry by ID |
| `list_entries` | List entries with filters |
| `update_entry` | Update entry |
| `delete_entry` | Delete entry |

### Taxonomy Management (8 tools)
| Tool | Description |
|------|-------------|
| `create_taxonomy` | Create taxonomy |
| `get_taxonomy` | Get taxonomy by ID or slug |
| `list_taxonomies` | List all taxonomies |
| `delete_taxonomy` | Delete taxonomy |
| `create_term` | Create term in taxonomy |
| `get_term` | Get term by ID |
| `list_terms` | List terms in taxonomy |
| `delete_term` | Delete term |

### User Management (8 tools)
| Tool | Description |
|------|-------------|
| `create_user` | Create new user |
| `get_user` | Get user by ID |
| `list_users` | List all users |
| `update_user` | Update user |
| `delete_user` | Delete user |
| `authenticate_user` | Login with credentials |
| `generate_api_key` | Generate API key for user |
| `change_password` | Change user password |

### Structure Migration (3 tools)
| Tool | Description |
|------|-------------|
| `export_structure` | Export content types and taxonomies |
| `import_structure` | Import structure with options |
| `get_structure_summary` | Get summary of current structure |

### Search Tools (3 tools)
| Tool | Description |
|------|-------------|
| `search` | Full-text search across entries, content-types, users |
| `search_in_content_type` | Search within a specific content type |
| `search_suggest` | Get search suggestions from partial query |

### Scheduler Tools (4 tools)
| Tool | Description |
|------|-------------|
| `scheduler_status` | Get scheduler status and stats |
| `scheduler_upcoming` | List entries scheduled for publishing |
| `schedule_entry` | Schedule an entry for future publishing |
| `cancel_schedule` | Cancel scheduled publishing |

### Audit Tools (4 tools)
| Tool | Description |
|------|-------------|
| `audit_recent` | Get recent audit log entries |
| `audit_query` | Query audit logs with filters |
| `audit_resource_history` | Get change history for a resource |
| `audit_stats` | Get audit log statistics |

### Revision Tools (3 tools)
| Tool | Description |
|------|-------------|
| `revision_list` | Get revision history for an entry |
| `revision_compare` | Compare two revisions (diff) |
| `revision_stats` | Get revision statistics |

### Webhook Tools (4 tools)
| Tool | Description |
|------|-------------|
| `webhook_list` | List all configured webhooks |
| `webhook_create` | Create a new webhook |
| `webhook_test` | Test a webhook |
| `webhook_stats` | Get webhook statistics |

### Backup Tools (4 tools)
| Tool | Description |
|------|-------------|
| `backup_create` | Create full CMS backup |
| `backup_list` | List available backups |
| `backup_restore` | Restore from backup |
| `backup_stats` | Get backup statistics |

---

## Plugin System

### Configuration
File: `plugins.json`

```json
{
  "plugins": [
    {
      "name": "my-plugin",
      "source": "npm",
      "package": "lokicms-plugin-my-plugin",
      "enabled": true,
      "config": {}
    },
    {
      "name": "local-plugin",
      "source": "local",
      "path": "./plugins/my-local-plugin",
      "enabled": true,
      "settings": { ... }
    }
  ]
}
```

### Example Plugins (Preconfigured)
| Plugin | Description |
|--------|-------------|
| `github-media` | Upload media files to GitHub repository |
| `stripe` | Payment processing with Stripe |
| `webhooks` | Webhook system for external integrations |

Plugin routes are available at: `/api/plugins/{plugin-name}/`

### Plugin Structure
```typescript
// Plugin must export default
export default {
  name: 'plugin-name',
  version: '1.0.0',

  hooks: {
    'entry:beforeCreate': async (entry, context) => {
      // Modify entry before creation
      return entry;
    }
  },

  routes: (app) => {
    app.get('/api/my-route', (c) => c.json({ ok: true }));
  },

  mcpTools: {
    my_tool: {
      description: 'My custom tool',
      inputSchema: z.object({ param: z.string() }),
      handler: async (input) => ({ result: input.param })
    }
  }
};
```

### Available Hooks (25)
```
entry:beforeCreate, entry:afterCreate
entry:beforeUpdate, entry:afterUpdate
entry:beforeDelete, entry:afterDelete
entry:beforePublish, entry:afterPublish

contentType:beforeCreate, contentType:afterCreate
contentType:beforeUpdate, contentType:afterUpdate
contentType:beforeDelete, contentType:afterDelete

taxonomy:beforeCreate, taxonomy:afterCreate
taxonomy:beforeDelete, taxonomy:afterDelete

term:beforeCreate, term:afterCreate
term:beforeDelete, term:afterDelete

user:beforeCreate, user:afterCreate
user:beforeDelete, user:afterDelete
user:afterLogin
```

---

## Testing

### Structure
```
src/__tests__/
├── unit/
│   ├── lokijs/           # LokiJS tests (216)
│   ├── services/         # Service tests (~195)
│   └── middleware/       # Middleware tests
├── integration/
│   └── api/              # API integration tests (~145)
└── utils/
    └── factories/        # Test data factories
```

### Running Tests
```bash
npm run test:run          # Run all tests once
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report
```

### Factories
```typescript
import { createContentType, createEntry } from './utils/factories/index.js';

const contentType = createContentType({ name: 'Post' });
const entry = createEntry({ contentTypeId: contentType.id });
```

---

## Code Style

- **TypeScript**: Strict mode enabled
- **Modules**: ES Modules (`import/export`)
- **Validation**: Zod schemas for all inputs
- **Services**: Singleton pattern
- **Async**: All database operations are async
- **Error Handling**: Throw errors, catch at API/MCP layer

### Import Pattern
```typescript
// Always use .js extension for local imports
import { something } from './module.js';
```

---

## Common Tasks

### Create a New Content Type
```typescript
const contentType = await contentTypeService.create({
  name: 'Article',
  slug: 'article',
  description: 'Blog articles',
  fields: [
    { name: 'title', label: 'Title', type: 'text', required: true },
    { name: 'content', label: 'Content', type: 'richtext', required: true },
  ]
});
```

### Create an Entry
```typescript
const entry = await entryService.create({
  contentTypeId: contentType.id,
  status: 'draft',
  data: {
    title: 'My Article',
    content: '<p>Article content...</p>'
  }
});
```

### Add API Endpoint
```typescript
// In src/api/routes/myroute.ts
import { Hono } from 'hono';
export const myRoutes = new Hono();

myRoutes.get('/my-endpoint', async (c) => {
  return c.json({ message: 'Hello' });
});

// Register in src/api/index.ts
import { myRoutes } from './routes/myroute.js';
app.route('/api', myRoutes);
```

### Add MCP Tool
```typescript
// In src/mcp/tools/mytool.ts
import { z } from 'zod';

export const myTools = {
  my_custom_tool: {
    description: 'Description for AI agent',
    inputSchema: z.object({
      param: z.string().describe('Parameter description'),
    }),
    handler: async (input: { param: string }) => {
      // Tool logic
      return { result: input.param };
    },
  },
};

// Register in src/mcp/index.ts
import { myTools } from './tools/mytool.js';
const coreTools = { ...existingTools, ...myTools };
```

### Add Hook Handler
```typescript
// In a plugin or directly in code
import { hooks } from './plugins/hooks.js';

hooks.register('entry:beforeCreate', async (entry, context) => {
  // Modify entry
  entry.data.processedAt = Date.now();
  return entry;
});
```

---

## Database

### Location
- Default: `./data/cms.db`
- Configurable via `DB_PATH` environment variable

### Collections
| Collection | Model |
|------------|-------|
| `contentTypes` | ContentType |
| `entries` | Entry |
| `taxonomies` | Taxonomy |
| `terms` | Term |
| `users` | User |

### Access
```typescript
import {
  getContentTypesCollection,
  getEntriesCollection,
  getTaxonomiesCollection,
  getTermsCollection,
  getUsersCollection,
  saveDatabase
} from './db/index.js';

const collection = getEntriesCollection();
const entries = collection.find({ status: 'published' });
await saveDatabase(); // Persist changes
```

---

## Structure Migration

Export and import CMS structure (content types, taxonomies) without content.

### CLI
```bash
# Export
npm run export:structure                    # → structure.json
npm run export:structure ./backup.json      # Custom path

# Import
npm run import:structure ./structure.json
npm run import:structure ./structure.json -- --skip-existing
npm run import:structure ./structure.json -- --update-existing
npm run import:structure ./structure.json -- --dry-run
```

### MCP Tools
```typescript
// Export
await callTool('export_structure', {});

// Import
await callTool('import_structure', {
  structure: exportedData,
  skipExisting: true,    // Skip if exists
  updateExisting: false  // Update if exists
});

// Summary
await callTool('get_structure_summary', {});
```

---

## Production Deployment

### PM2 Configuration
File: `ecosystem.config.cjs`

```javascript
module.exports = {
  apps: [{
    name: 'lokicms-api',
    script: 'dist/api/index.js',
    interpreter: 'bun',         // or 'node'
    instances: 1,               // LokiJS is not cluster-safe
    autorestart: true,
    max_memory_restart: '200M',
    env: {
      NODE_ENV: 'production',
      PORT: 3005,
    }
  }]
};
```

### Deployment Steps
```bash
# 1. Clone and install
git clone https://github.com/user/lokicms.git
cd lokicms && npm install

# 2. Configure
cp .env.example .env
# Edit .env with production values

# 3. Build and start
npm run build
pm2 start ecosystem.config.cjs

# 4. Or use the CLI
./lokicms start
```

### Backup & Restore
```bash
./lokicms backup    # Creates backup-YYYYMMDD-HHMMSS.tar.gz
# Contains: data/, plugins.json, .env
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` / `3005` | API server port (dev/prod) |
| `HOST` | `localhost` | Server hostname |
| `DB_PATH` | `./data/cms.db` | Database file path |
| `JWT_SECRET` | (required) | Secret for JWT signing |
| `NODE_ENV` | `development` | Environment mode |
| `GITHUB_MEDIA_TOKEN` | - | GitHub token for media plugin |
| `STRIPE_SECRET_KEY` | - | Stripe secret for payments plugin |
