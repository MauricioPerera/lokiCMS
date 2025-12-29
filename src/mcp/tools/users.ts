/**
 * MCP User Tools
 * Tools for managing users and API keys
 */

import { z } from 'zod';
import { userService } from '../../services/index.js';
import type { CreateUserInput, UpdateUserInput, UserRole } from '../../models/index.js';

// Tool definitions for user management
export const userTools = {
  list_users: {
    description: 'List all users in the CMS',
    inputSchema: z.object({}),
    handler: async () => {
      const users = await userService.findAll();
      return { users };
    },
  },

  get_user: {
    description: 'Get a user by ID or email',
    inputSchema: z.object({
      id: z.string().optional().describe('User ID'),
      email: z.string().optional().describe('User email'),
    }),
    handler: async (input: { id?: string; email?: string }) => {
      let user = null;

      if (input.id) {
        user = await userService.findById(input.id);
      } else if (input.email) {
        user = await userService.findByEmail(input.email);
      } else {
        return { error: 'Provide either id or email' };
      }

      if (!user) {
        return { error: 'User not found' };
      }
      return { user };
    },
  },

  create_user: {
    description: 'Create a new user account',
    inputSchema: z.object({
      email: z.string().email().describe('User email address'),
      password: z.string().min(8).describe('Password (min 8 characters)'),
      name: z.string().describe('Display name'),
      role: z.enum(['admin', 'editor', 'author', 'viewer']).optional().describe('User role'),
    }),
    handler: async (input: CreateUserInput) => {
      try {
        const user = await userService.create(input);
        return { user, message: 'User created successfully' };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to create user' };
      }
    },
  },

  update_user: {
    description: 'Update a user account',
    inputSchema: z.object({
      id: z.string().describe('User ID'),
      email: z.string().email().optional().describe('New email'),
      name: z.string().optional().describe('New display name'),
      role: z.enum(['admin', 'editor', 'author', 'viewer']).optional().describe('New role'),
      isActive: z.boolean().optional().describe('Account active status'),
    }),
    handler: async (input: { id: string } & UpdateUserInput) => {
      try {
        const { id, ...updates } = input;
        const user = await userService.update(id, updates);
        return { user, message: 'User updated successfully' };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to update user' };
      }
    },
  },

  update_user_role: {
    description: 'Change a user\'s role',
    inputSchema: z.object({
      id: z.string().describe('User ID'),
      role: z.enum(['admin', 'editor', 'author', 'viewer']).describe('New role'),
    }),
    handler: async ({ id, role }: { id: string; role: UserRole }) => {
      try {
        const user = await userService.update(id, { role });
        return { user, message: `User role changed to ${role}` };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to update user role' };
      }
    },
  },

  delete_user: {
    description: 'Delete a user account',
    inputSchema: z.object({
      id: z.string().describe('User ID to delete'),
    }),
    handler: async ({ id }: { id: string }) => {
      try {
        await userService.delete(id);
        return { message: 'User deleted successfully' };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to delete user' };
      }
    },
  },

  create_api_key: {
    description: 'Create an API key for a user',
    inputSchema: z.object({
      userId: z.string().describe('User ID'),
      name: z.string().describe('API key name/description'),
      permissions: z.array(z.string()).optional().describe('Specific permissions (defaults to user role permissions)'),
      expiresInDays: z.number().optional().describe('Days until expiration'),
    }),
    handler: async (input: {
      userId: string;
      name: string;
      permissions?: string[];
      expiresInDays?: number;
    }) => {
      try {
        const result = await userService.createApiKey(input.userId, {
          name: input.name,
          permissions: input.permissions ?? [],
          expiresInDays: input.expiresInDays,
        });
        return {
          apiKey: {
            id: result.apiKey.id,
            name: result.apiKey.name,
            keyPrefix: result.apiKey.keyPrefix,
            expiresAt: result.apiKey.expiresAt,
          },
          key: result.key,
          message: 'API key created. Save this key - it will not be shown again.',
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to create API key' };
      }
    },
  },

  list_api_keys: {
    description: 'List API keys for a user',
    inputSchema: z.object({
      userId: z.string().describe('User ID'),
    }),
    handler: async ({ userId }: { userId: string }) => {
      try {
        const apiKeys = await userService.listApiKeys(userId);
        return { apiKeys };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to list API keys' };
      }
    },
  },

  revoke_api_key: {
    description: 'Revoke an API key',
    inputSchema: z.object({
      userId: z.string().describe('User ID'),
      apiKeyId: z.string().describe('API key ID to revoke'),
    }),
    handler: async ({ userId, apiKeyId }: { userId: string; apiKeyId: string }) => {
      try {
        await userService.revokeApiKey(userId, apiKeyId);
        return { message: 'API key revoked successfully' };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to revoke API key' };
      }
    },
  },
};
