# LokiCMS

Headless CMS con base de datos LokiJS modernizada, API REST y servidor MCP para gestión mediante agentes AI.

## Características

- **Base de datos embebida** - LokiJS modernizado en TypeScript sin dependencias obsoletas
- **API REST** - Endpoints completos con autenticación JWT y API Keys
- **Servidor MCP** - Integración con agentes AI via Model Context Protocol
- **Sin interfaz gráfica** - Diseñado para consumo headless

## Requisitos

- Node.js >= 20.0.0
- npm o pnpm

## Instalación

```bash
git clone <repository>
cd loki-cms
npm install
```

## Configuración

Crea un archivo `.env` basado en `.env.example`:

```bash
cp .env.example .env
```

Variables de entorno disponibles:

| Variable | Descripción | Default |
|----------|-------------|---------|
| `PORT` | Puerto del servidor API | `3000` |
| `HOST` | Host del servidor | `localhost` |
| `DB_PATH` | Ruta al archivo de base de datos | `./data/cms.db` |
| `JWT_SECRET` | Clave secreta para tokens JWT | (requerido en producción) |
| `JWT_EXPIRES_IN` | Expiración de tokens | `7d` |
| `API_KEY_PREFIX` | Prefijo para API keys | `lkcms_` |

## Uso

### Inicializar Base de Datos

```bash
npm run seed
```

Esto crea:
- Usuario administrador (`admin@lokicms.local` / `admin123456`)
- Content types por defecto (Post, Page)
- Taxonomías por defecto (Category, Tag)
- Términos de ejemplo

### Iniciar Servidor API

```bash
# Desarrollo (con hot reload)
npm run dev

# Producción
npm run build
npm run start
```

El servidor estará disponible en `http://localhost:3000`

### Iniciar Servidor MCP

```bash
# Desarrollo
npm run dev:mcp

# Producción
npm run build
npm run start:mcp
```

## API REST

### Autenticación

#### Registro
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

Respuesta:
```json
{
  "user": { ... },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

#### Usar Token
```http
Authorization: Bearer <accessToken>
```

#### Usar API Key
```http
Authorization: ApiKey lkcms_abc123...
```

### Content Types

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/content-types` | Listar todos |
| `POST` | `/api/content-types` | Crear nuevo |
| `GET` | `/api/content-types/:slug` | Obtener por slug |
| `PUT` | `/api/content-types/:slug` | Actualizar |
| `DELETE` | `/api/content-types/:slug` | Eliminar |

#### Crear Content Type
```http
POST /api/content-types
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Product",
  "slug": "product",
  "description": "E-commerce products",
  "fields": [
    {
      "name": "title",
      "label": "Title",
      "type": "text",
      "required": true
    },
    {
      "name": "price",
      "label": "Price",
      "type": "number",
      "required": true
    },
    {
      "name": "description",
      "label": "Description",
      "type": "richtext"
    }
  ]
}
```

**Tipos de campo soportados:**
- `text` - Texto corto
- `textarea` - Texto largo
- `richtext` - HTML/Markdown
- `number` - Número
- `boolean` - Verdadero/Falso
- `date` - Fecha
- `datetime` - Fecha y hora
- `email` - Email validado
- `url` - URL validada
- `slug` - Slug URL-friendly
- `select` - Selección única
- `multiselect` - Selección múltiple
- `relation` - Relación con otra entrada
- `media` - Archivo multimedia
- `json` - Objeto JSON

### Entries

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/entries` | Listar con filtros |
| `POST` | `/api/entries` | Crear entrada |
| `GET` | `/api/entries/id/:id` | Obtener por ID |
| `GET` | `/api/entries/:contentType/:slug` | Obtener por tipo y slug |
| `PUT` | `/api/entries/id/:id` | Actualizar |
| `DELETE` | `/api/entries/id/:id` | Eliminar |
| `POST` | `/api/entries/id/:id/publish` | Publicar |
| `POST` | `/api/entries/id/:id/unpublish` | Despublicar |

#### Filtros de Entries
```http
GET /api/entries?contentType=post&status=published&search=hello&page=1&limit=10
```

Parámetros:
- `contentType` - Slug del content type
- `status` - `draft`, `published`, `archived`
- `authorId` - ID del autor
- `search` - Búsqueda en título y slug
- `terms` - IDs de términos separados por coma
- `page` - Número de página (default: 1)
- `limit` - Resultados por página (default: 20, max: 100)
- `sortBy` - Campo de ordenación (`title`, `createdAt`, `updatedAt`, `publishedAt`)
- `sortOrder` - `asc` o `desc`

### Taxonomies

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/taxonomies` | Listar todas |
| `POST` | `/api/taxonomies` | Crear nueva |
| `GET` | `/api/taxonomies/:slug` | Obtener por slug |
| `PUT` | `/api/taxonomies/:slug` | Actualizar |
| `DELETE` | `/api/taxonomies/:slug` | Eliminar |

### Terms

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/terms/taxonomy/:slug` | Listar términos |
| `POST` | `/api/terms` | Crear término |
| `GET` | `/api/terms/id/:id` | Obtener por ID |
| `PUT` | `/api/terms/id/:id` | Actualizar |
| `DELETE` | `/api/terms/id/:id` | Eliminar |

### Users (Admin)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/users` | Listar usuarios |
| `POST` | `/api/users` | Crear usuario |
| `GET` | `/api/users/:id` | Obtener usuario |
| `PUT` | `/api/users/:id` | Actualizar usuario |
| `DELETE` | `/api/users/:id` | Eliminar usuario |

## Roles y Permisos

| Rol | Descripción |
|-----|-------------|
| `admin` | Acceso completo a todo el sistema |
| `editor` | Gestión de contenido y taxonomías |
| `author` | Crear y editar su propio contenido |
| `viewer` | Solo lectura |

## Sistema de Plugins

LokiCMS incluye un sistema de plugins extensible que permite agregar funcionalidad mediante npm packages o plugins locales.

### Configuración

Crea un archivo `plugins.json` en la raíz del proyecto:

```json
{
  "plugins": [
    {
      "name": "lokicms-plugin-stripe",
      "enabled": true,
      "source": "npm",
      "settings": {
        "secretKey": "${STRIPE_SECRET_KEY}",
        "webhookSecret": "${STRIPE_WEBHOOK_SECRET}",
        "currency": "usd"
      }
    },
    {
      "name": "my-custom-plugin",
      "enabled": true,
      "source": "local",
      "path": "./plugins/my-custom-plugin",
      "settings": {
        "apiKey": "${MY_PLUGIN_API_KEY}",
        "debug": false
      }
    }
  ]
}
```

Las variables de entorno se interpolan automáticamente (`${VAR}` o `${VAR:default}`).

### Hooks Disponibles

Los plugins pueden registrar hooks before/after para todas las operaciones CRUD:

| Entidad | Hooks |
|---------|-------|
| Entry | `entry:beforeCreate`, `entry:afterCreate`, `entry:beforeUpdate`, `entry:afterUpdate`, `entry:beforeDelete`, `entry:afterDelete`, `entry:beforePublish`, `entry:afterPublish`, `entry:beforeUnpublish`, `entry:afterUnpublish` |
| ContentType | `contentType:beforeCreate`, `contentType:afterCreate`, `contentType:beforeUpdate`, `contentType:afterUpdate`, `contentType:beforeDelete`, `contentType:afterDelete` |
| Taxonomy | `taxonomy:beforeCreate`, `taxonomy:afterCreate`, `taxonomy:beforeUpdate`, `taxonomy:afterUpdate`, `taxonomy:beforeDelete`, `taxonomy:afterDelete` |
| Term | `term:beforeCreate`, `term:afterCreate`, `term:beforeUpdate`, `term:afterUpdate`, `term:beforeDelete`, `term:afterDelete` |
| User | `user:beforeCreate`, `user:afterCreate`, `user:beforeUpdate`, `user:afterUpdate`, `user:beforeDelete`, `user:afterDelete`, `user:afterLogin` |
| System | `system:ready`, `system:shutdown` |

### Crear un Plugin

#### Estructura del Plugin

```
lokicms-plugin-example/
├── package.json
├── src/
│   └── index.ts
└── dist/
    └── index.js
```

#### package.json

```json
{
  "name": "lokicms-plugin-example",
  "version": "1.0.0",
  "main": "dist/index.js",
  "peerDependencies": {
    "loki-cms": "^1.0.0"
  },
  "lokicms": {
    "displayName": "Example Plugin",
    "minVersion": "1.0.0"
  }
}
```

#### Plugin Definition

```typescript
import type { PluginDefinition } from 'loki-cms';

const plugin: PluginDefinition = {
  name: 'example',
  version: '1.0.0',
  displayName: 'Example Plugin',
  description: 'An example plugin',

  lifecycle: {
    onLoad: async () => {
      console.log('Plugin loaded');
    },
    onEnable: async () => {
      console.log('Plugin enabled');
    },
    onDisable: async () => {
      console.log('Plugin disabled');
    },
    onUninstall: async () => {
      console.log('Plugin uninstalled');
    },
  },

  async setup(api) {
    // Registrar hooks
    api.hooks.on('entry:afterCreate', async ({ entry }) => {
      api.logger.info('Entry created:', entry);
    });

    // Registrar content types
    await api.contentTypes.register({
      name: 'Product',
      slug: 'product',
      fields: [
        { name: 'title', label: 'Title', type: 'text', required: true },
        { name: 'price', label: 'Price', type: 'number', required: true },
      ],
    });

    // Registrar rutas API
    const { Hono } = await import('hono');
    const routes = new Hono();

    routes.get('/status', (c) => c.json({ status: 'ok' }));
    routes.post('/webhook', async (c) => {
      const body = await c.req.json();
      // Procesar webhook...
      return c.json({ received: true });
    });

    api.routes.register(routes);
    // Rutas disponibles en: /api/plugins/example/*

    // Registrar MCP tools
    api.mcp.registerTool('example_action', {
      description: 'Example MCP tool',
      inputSchema: z.object({
        param: z.string(),
      }),
      handler: async ({ param }) => {
        return { result: `Processed: ${param}` };
      },
    });

    // Crear colección de base de datos
    interface MyData {
      name: string;
      value: number;
    }
    const collection = api.database.createCollection<MyData>({
      name: 'my_data',
      options: {
        unique: ['name'],
        indices: ['value'],
      },
    });

    // Acceder a configuración del plugin
    const apiKey = api.config.get<string>('apiKey');
    const debug = api.config.get<boolean>('debug', false);
  },
};

export default plugin;
```

### Plugin API

| Propiedad | Descripción |
|-----------|-------------|
| `api.pluginName` | Nombre del plugin |
| `api.services` | Acceso a servicios del CMS |
| `api.hooks` | Registro de hooks |
| `api.routes` | Registro de rutas API |
| `api.mcp` | Registro de MCP tools |
| `api.database` | Gestión de colecciones |
| `api.contentTypes` | Registro de content types |
| `api.config` | Acceso a configuración |
| `api.logger` | Logging con prefijo del plugin |

### Servicios Disponibles

```typescript
// Entries
api.services.entries.create(input, authorId);
api.services.entries.findById(id);
api.services.entries.findBySlug(contentType, slug);
api.services.entries.findAll(filters);
api.services.entries.update(id, input);
api.services.entries.delete(id);
api.services.entries.publish(id);
api.services.entries.unpublish(id);

// Content Types
api.services.contentTypes.create(input);
api.services.contentTypes.findById(id);
api.services.contentTypes.findBySlug(slug);
api.services.contentTypes.findAll();
api.services.contentTypes.update(id, input);
api.services.contentTypes.delete(id);

// Taxonomies
api.services.taxonomies.create(input);
api.services.taxonomies.findById(id);
api.services.taxonomies.findBySlug(slug);
api.services.taxonomies.findAll();
api.services.taxonomies.update(id, input);
api.services.taxonomies.delete(id);

// Terms
api.services.terms.create(input);
api.services.terms.findById(id);
api.services.terms.findBySlug(slug, taxonomySlug);
api.services.terms.findByTaxonomy(taxonomyId);
api.services.terms.update(id, input);
api.services.terms.delete(id);

// Users
api.services.users.findById(id);
api.services.users.findByEmail(email);
api.services.users.findAll();
```

### Ejemplo: Plugin de Stripe

```typescript
import type { PluginDefinition } from 'loki-cms';
import Stripe from 'stripe';

const stripePlugin: PluginDefinition = {
  name: 'stripe',
  version: '1.0.0',

  async setup(api) {
    const secretKey = api.config.get<string>('secretKey');
    const stripe = new Stripe(secretKey);

    // Crear content types para productos y órdenes
    await api.contentTypes.register({
      name: 'Stripe Product',
      slug: 'stripe-product',
      fields: [
        { name: 'title', label: 'Title', type: 'text', required: true },
        { name: 'price', label: 'Price', type: 'number', required: true },
        { name: 'stripeProductId', label: 'Stripe Product ID', type: 'text' },
        { name: 'stripePriceId', label: 'Stripe Price ID', type: 'text' },
      ],
    });

    await api.contentTypes.register({
      name: 'Stripe Order',
      slug: 'stripe-order',
      fields: [
        { name: 'stripeSessionId', label: 'Stripe Session ID', type: 'text' },
        { name: 'customerEmail', label: 'Customer Email', type: 'email' },
        { name: 'amount', label: 'Amount', type: 'number' },
        { name: 'status', label: 'Status', type: 'select', options: ['pending', 'paid', 'failed'] },
      ],
    });

    // Sincronizar productos con Stripe
    api.hooks.on('entry:afterCreate', async ({ entry }) => {
      if (entry.contentTypeSlug === 'stripe-product') {
        const product = await stripe.products.create({
          name: entry.data.title,
        });
        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: entry.data.price * 100,
          currency: api.config.get('currency', 'usd'),
        });
        // Actualizar entrada con IDs de Stripe
        await api.services.entries.update(entry.id, {
          data: {
            ...entry.data,
            stripeProductId: product.id,
            stripePriceId: price.id,
          },
        });
      }
    });

    // Rutas para webhooks y checkout
    const { Hono } = await import('hono');
    const routes = new Hono();

    routes.post('/webhook', async (c) => {
      // Procesar webhook de Stripe
    });

    routes.post('/checkout', async (c) => {
      // Crear sesión de checkout
    });

    api.routes.register(routes);

    // MCP tool para crear checkout
    api.mcp.registerTool('create_checkout_session', {
      description: 'Create a Stripe checkout session',
      inputSchema: z.object({
        productId: z.string(),
        successUrl: z.string(),
        cancelUrl: z.string(),
      }),
      handler: async ({ productId, successUrl, cancelUrl }) => {
        const entry = await api.services.entries.findById(productId);
        const session = await stripe.checkout.sessions.create({
          line_items: [{ price: entry.data.stripePriceId, quantity: 1 }],
          mode: 'payment',
          success_url: successUrl,
          cancel_url: cancelUrl,
        });
        return { url: session.url };
      },
    });
  },
};

export default stripePlugin;
```

### Publicar un Plugin en npm

#### 1. Estructura del Proyecto

```
lokicms-plugin-mi-plugin/
├── src/
│   └── index.ts          # Código fuente TypeScript
├── dist/
│   └── index.js          # Código compilado (generado)
├── package.json
├── tsconfig.json
└── README.md
```

#### 2. Configurar package.json

```json
{
  "name": "lokicms-plugin-mi-plugin",
  "version": "1.0.0",
  "description": "Mi plugin para LokiCMS",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "keywords": [
    "lokicms",
    "lokicms-plugin",
    "cms",
    "plugin"
  ],
  "peerDependencies": {
    "loki-cms": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "loki-cms": "^1.0.0"
  },
  "lokicms": {
    "displayName": "Mi Plugin",
    "minVersion": "1.0.0"
  },
  "files": [
    "dist",
    "README.md"
  ],
  "license": "MIT"
}
```

#### 3. Configurar tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

#### 4. Compilar y Publicar

```bash
# Compilar TypeScript a JavaScript
npm run build

# Verificar que dist/ contiene los archivos
ls dist/

# Login en npm (si no lo has hecho)
npm login

# Publicar (ejecuta prepublishOnly automáticamente)
npm publish

# Para actualizaciones
npm version patch  # o minor/major
npm publish
```

#### 5. Convenciones de Nombres

| Tipo | Formato | Ejemplo |
|------|---------|---------|
| Paquete npm | `lokicms-plugin-{nombre}` | `lokicms-plugin-stripe` |
| Scoped | `@scope/lokicms-plugin-{nombre}` | `@miempresa/lokicms-plugin-analytics` |

El loader detecta automáticamente paquetes que siguen esta convención en `node_modules`.

#### 6. Usar el Plugin Publicado

```bash
# Instalar
npm install lokicms-plugin-mi-plugin
```

```json
// plugins.json
{
  "plugins": [
    {
      "name": "lokicms-plugin-mi-plugin",
      "enabled": true,
      "source": "npm",
      "settings": {
        "apiKey": "${MI_PLUGIN_API_KEY}"
      }
    }
  ]
}
```

## Servidor MCP

El servidor MCP permite gestionar el CMS mediante agentes AI como Claude.

### Configuración en Claude Code

Agrega al archivo de configuración MCP:

```json
{
  "mcpServers": {
    "lokicms": {
      "command": "node",
      "args": ["dist/mcp/index.js"],
      "cwd": "/path/to/loki-cms",
      "env": {
        "DB_PATH": "./data/cms.db"
      }
    }
  }
}
```

### Tools Disponibles

#### Content Types
- `list_content_types` - Listar tipos de contenido
- `get_content_type` - Obtener tipo por slug
- `create_content_type` - Crear nuevo tipo
- `delete_content_type` - Eliminar tipo

#### Entries
- `list_entries` - Listar entradas con filtros
- `get_entry` - Obtener entrada por ID o slug
- `create_entry` - Crear nueva entrada
- `update_entry` - Actualizar entrada
- `delete_entry` - Eliminar entrada
- `publish_entry` - Publicar entrada
- `unpublish_entry` - Despublicar entrada

#### Taxonomies
- `list_taxonomies` - Listar taxonomías
- `get_taxonomy` - Obtener taxonomía
- `create_taxonomy` - Crear taxonomía
- `delete_taxonomy` - Eliminar taxonomía

#### Terms
- `list_terms` - Listar términos de una taxonomía
- `get_term` - Obtener término
- `create_term` - Crear término
- `update_term` - Actualizar término
- `delete_term` - Eliminar término
- `assign_terms` - Asignar términos a entrada
- `get_entries_by_term` - Obtener entradas por término

#### Users
- `list_users` - Listar usuarios
- `get_user` - Obtener usuario
- `create_user` - Crear usuario
- `update_user` - Actualizar usuario
- `update_user_role` - Cambiar rol de usuario
- `delete_user` - Eliminar usuario
- `create_api_key` - Crear API key
- `list_api_keys` - Listar API keys
- `revoke_api_key` - Revocar API key

#### Structure Migration
- `export_structure` - Exportar estructura (content types y taxonomías) a JSON
- `import_structure` - Importar estructura desde JSON
- `get_structure_summary` - Ver resumen de la estructura actual

## LokiJS Modernizado

El proyecto incluye una versión modernizada de LokiJS con:

### Mejoras
- **TypeScript nativo** con tipado completo
- **Clases ES6** en lugar de prototypes
- **API async/await** en lugar de callbacks
- **Sin dependencias obsoletas** (eliminado PhantomJS, Karma antiguo, etc.)

### Adaptadores de Persistencia

```typescript
import { Loki, FsAdapter, MemoryAdapter, EncryptedFsAdapter, CompressedFsAdapter } from './lib/lokijs';

// Archivo estándar
const db = new Loki('data.db', {
  adapter: new FsAdapter()
});

// En memoria
const memDb = new Loki('memory.db', {
  adapter: new MemoryAdapter()
});

// Encriptado (AES-256-GCM)
const encDb = new Loki('encrypted.db', {
  adapter: new EncryptedFsAdapter('my-secret-key')
});

// Comprimido (gzip)
const compDb = new Loki('compressed.db', {
  adapter: new CompressedFsAdapter()
});
```

### Uso Básico

```typescript
import { Loki } from './lib/lokijs';

// Crear base de datos
const db = new Loki('mydb.db', {
  autosave: true,
  autosaveInterval: 5000
});

// Cargar datos existentes
await db.load();

// Crear colección
interface User {
  name: string;
  email: string;
  age: number;
}

const users = db.addCollection<User>('users', {
  unique: ['email'],
  indices: ['name', 'age']
});

// Insertar
const user = users.insert({
  name: 'John',
  email: 'john@example.com',
  age: 30
});

// Consultar
const results = users.find({ age: { $gte: 18 } });

// Encadenar consultas
const adults = users.chain()
  .find({ age: { $gte: 18 } })
  .simplesort('name')
  .limit(10)
  .data();

// Guardar
await db.save();
```

### Operadores de Consulta

- `$eq` - Igual
- `$ne` - No igual
- `$gt` - Mayor que
- `$gte` - Mayor o igual
- `$lt` - Menor que
- `$lte` - Menor o igual
- `$in` - En array
- `$nin` - No en array
- `$between` - Entre dos valores
- `$regex` - Expresión regular
- `$contains` - Contiene (arrays/strings)
- `$containsAny` - Contiene alguno
- `$containsNone` - No contiene ninguno
- `$exists` - Existe
- `$type` - Tipo de dato
- `$size` - Tamaño de array
- `$elemMatch` - Match en elementos de array
- `$and` - AND lógico
- `$or` - OR lógico
- `$not` - Negación

## Migración de Estructura

LokiCMS permite exportar e importar la estructura del CMS (content types y taxonomías) sin migrar el contenido. Útil para replicar la configuración entre entornos.

### Exportar Estructura

```bash
# Exportar a structure.json (por defecto)
npm run export:structure

# Exportar a archivo específico
npm run export:structure ./backup/mi-estructura.json
```

### Importar Estructura

```bash
# Importar desde structure.json
npm run import:structure

# Importar desde archivo específico
npm run import:structure ./backup/mi-estructura.json

# Opciones:
#   --skip-existing, -s    Saltar items que ya existen
#   --update-existing, -u  Actualizar items existentes
#   --dry-run, -d          Simular sin hacer cambios

npm run import:structure ./structure.json --skip-existing
npm run import:structure ./structure.json --update-existing
npm run import:structure ./structure.json --dry-run
```

### Formato del Archivo

```json
{
  "version": "1.0.0",
  "exportedAt": "2024-01-15T10:30:00.000Z",
  "contentTypes": [
    {
      "name": "Product",
      "slug": "product",
      "description": "E-commerce products",
      "fields": [
        { "name": "title", "label": "Title", "type": "text", "required": true },
        { "name": "price", "label": "Price", "type": "number" }
      ]
    }
  ],
  "taxonomies": [
    {
      "name": "Category",
      "slug": "category",
      "hierarchical": true
    }
  ]
}
```

### Via MCP

Los agentes AI pueden usar estas herramientas:

- `export_structure` - Exportar estructura como JSON
- `import_structure` - Importar estructura desde JSON
- `get_structure_summary` - Ver resumen de la estructura actual

## Scripts

| Script | Descripción |
|--------|-------------|
| `npm run dev` | API en modo desarrollo |
| `npm run dev:mcp` | MCP en modo desarrollo |
| `npm run build` | Compilar TypeScript |
| `npm run start` | Iniciar API (producción) |
| `npm run start:mcp` | Iniciar MCP (producción) |
| `npm run seed` | Crear datos iniciales |
| `npm run export:structure` | Exportar estructura a JSON |
| `npm run import:structure` | Importar estructura desde JSON |
| `npm run test` | Ejecutar tests |
| `npm run typecheck` | Verificar tipos |

## Estructura del Proyecto

```
loki-cms/
├── src/
│   ├── api/
│   │   ├── middleware/
│   │   │   ├── auth.ts        # Autenticación JWT/API Key
│   │   │   └── roles.ts       # Control de acceso
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── content-types.ts
│   │   │   ├── entries.ts
│   │   │   ├── taxonomies.ts
│   │   │   ├── terms.ts
│   │   │   └── users.ts
│   │   └── index.ts           # Servidor Hono
│   ├── db/
│   │   └── index.ts           # Configuración LokiJS
│   ├── lib/
│   │   └── lokijs/            # LokiJS modernizado
│   │       ├── adapters.ts
│   │       ├── collection.ts
│   │       ├── database.ts
│   │       ├── dynamicview.ts
│   │       ├── events.ts
│   │       ├── operators.ts
│   │       ├── resultset.ts
│   │       ├── types.ts
│   │       ├── utils.ts
│   │       └── index.ts
│   ├── mcp/
│   │   ├── tools/
│   │   │   ├── content.ts
│   │   │   ├── taxonomy.ts
│   │   │   ├── users.ts
│   │   │   └── structure.ts   # Migración de estructura
│   │   └── index.ts           # Servidor MCP
│   ├── models/
│   │   ├── content-type.ts
│   │   ├── entry.ts
│   │   ├── taxonomy.ts
│   │   ├── term.ts
│   │   ├── user.ts
│   │   └── index.ts
│   ├── plugins/               # Sistema de plugins
│   │   ├── types.ts           # Tipos e interfaces
│   │   ├── hooks.ts           # Sistema de hooks
│   │   ├── registry.ts        # Registro de plugins
│   │   ├── loader.ts          # Carga de plugins
│   │   ├── api.ts             # Factory de PluginAPI
│   │   ├── mcp-registry.ts    # Registro de MCP tools
│   │   ├── route-registry.ts  # Registro de rutas
│   │   ├── collection-manager.ts  # Gestor de colecciones
│   │   └── index.ts           # Exports
│   ├── scripts/               # CLI scripts
│   │   ├── export-structure.ts  # Exportar estructura
│   │   └── import-structure.ts  # Importar estructura
│   ├── services/
│   │   ├── content-type.service.ts
│   │   ├── entry.service.ts
│   │   ├── taxonomy.service.ts
│   │   ├── user.service.ts
│   │   └── index.ts
│   ├── index.ts
│   └── seed.ts
├── data/                      # Base de datos (gitignore)
├── dist/                      # Build (gitignore)
├── plugins.json               # Configuración de plugins
├── package.json
├── tsconfig.json
└── README.md
```

## Licencia

MIT
