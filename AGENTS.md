# LokiCMS - AI Agent Documentation

## Overview

LokiCMS is a **headless CMS** built for AI agent integration via Model Context Protocol (MCP).

| Aspect | Details |
|--------|---------|
| **Type** | Headless Content Management System |
| **Database** | LokiJS (embedded document database) |
| **API** | Hono framework (REST) |
| **AI Integration** | MCP (Model Context Protocol) |
| **Language** | TypeScript (ES Modules) |
| **Auth** | JWT tokens + API keys |

### Execution Modes

```bash
npm run dev          # REST API server (port 3000)
npm run dev:mcp      # MCP server (stdio transport)
npm run seed         # Initialize database with sample data
```

---

## Quick Start

```bash
# Install dependencies
npm install

# Development
npm run dev              # Start API server
npm run dev:mcp          # Start MCP server

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
  createdAt: number;
  updatedAt: number;
}

interface Field {
  name: string;           // Field identifier
  label: string;          // Display label
  type: FieldType;        // text, textarea, richtext, number, boolean, date, media, select, slug, relation
  required?: boolean;
  unique?: boolean;
  defaultValue?: unknown;
  validation?: object;    // Type-specific validation
}
```

### Entry
Instance of content based on a ContentType.

```typescript
interface Entry {
  id: string;
  contentTypeId: string;  // References ContentType
  status: 'draft' | 'published' | 'archived';
  data: Record<string, unknown>;  // Field values
  taxonomies?: Record<string, string[]>;  // taxonomy slug → term IDs
  author?: string;
  publishedAt?: number;
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

---

## API Routes

Base URL: `http://localhost:3000/api`

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

### Authentication

```bash
# JWT Token (header)
Authorization: Bearer <token>

# API Key (header)
X-API-Key: <key>
```

---

## MCP Tools

29 tools available for AI agents via MCP protocol.

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
      "enabled": true
    }
  ]
}
```

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

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | API server port |
| `DB_PATH` | `./data/cms.db` | Database file path |
| `JWT_SECRET` | (required) | Secret for JWT signing |
| `NODE_ENV` | `development` | Environment mode |
