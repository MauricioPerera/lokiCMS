/**
 * MCP Server
 * Model Context Protocol server for AI agent integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { initDatabase, closeDatabase, saveDatabase } from '../db/index.js';
import { contentTools } from './tools/content.js';
import { taxonomyTools } from './tools/taxonomy.js';
import { userTools } from './tools/users.js';
import { mcpToolRegistry } from '../plugins/index.js';

// Core tools (static)
const coreTools = {
  ...contentTools,
  ...taxonomyTools,
  ...userTools,
};

// Get all tools including plugin tools (dynamic)
function getAllTools() {
  return {
    ...coreTools,
    ...mcpToolRegistry.getAll(),
  };
}

// Convert Zod schema to JSON Schema for MCP
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const zodValue = value as z.ZodType;
      properties[key] = zodToJsonSchema(zodValue);

      // Check if required
      if (!(zodValue instanceof z.ZodOptional) && !(zodValue instanceof z.ZodNullable)) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  if (schema instanceof z.ZodString) {
    return { type: 'string', description: schema.description };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: 'number', description: schema.description };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean', description: schema.description };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToJsonSchema(schema.element),
      description: schema.description,
    };
  }

  if (schema instanceof z.ZodEnum) {
    return {
      type: 'string',
      enum: schema.options,
      description: schema.description,
    };
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap());
  }

  if (schema instanceof z.ZodNullable) {
    const inner = zodToJsonSchema(schema.unwrap());
    return { ...inner, nullable: true };
  }

  if (schema instanceof z.ZodRecord) {
    return {
      type: 'object',
      additionalProperties: true,
      description: schema.description,
    };
  }

  // Default fallback
  return { type: 'object' };
}

// Create MCP server
const server = new Server(
  {
    name: 'lokicms',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const allTools = getAllTools();
  const tools = Object.entries(allTools).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: zodToJsonSchema(tool.inputSchema),
  }));

  return { tools };
});

// Handle call tool request
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const allTools = getAllTools();

  const tool = allTools[name as keyof typeof allTools];
  if (!tool) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: `Unknown tool: ${name}` }),
        },
      ],
    };
  }

  try {
    // Validate input
    const validatedArgs = tool.inputSchema.parse(args ?? {});

    // Execute handler
    const result = await (tool.handler as (args: unknown) => Promise<unknown>)(validatedArgs);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: message }),
        },
      ],
      isError: true,
    };
  }
});

// Database configuration
const DB_PATH = process.env['DB_PATH'] || './data/cms.db';

// Start server
async function startServer() {
  try {
    // Initialize database
    console.error('Initializing database...');
    await initDatabase({
      path: DB_PATH,
      autosave: true,
      autosaveInterval: 5000,
    });
    console.error('Database initialized');

    // Create transport
    const transport = new StdioServerTransport();

    // Connect server to transport
    await server.connect(transport);
    console.error('MCP server running on stdio');

    // Graceful shutdown
    const shutdown = async () => {
      console.error('\nShutting down...');
      await saveDatabase();
      await closeDatabase();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Export server for testing
export { server };

// Start if run directly
startServer();
