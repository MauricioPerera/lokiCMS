/**
 * Users Routes
 * CRUD operations for user management (admin only)
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { userService } from '../../services/index.js';
import {
  CreateUserSchema,
  UpdateUserSchema,
  CreateApiKeySchema,
} from '../../models/index.js';
import { auth, requireSession } from '../middleware/auth.js';
import { adminOnly, requirePermission } from '../middleware/roles.js';

const userRoutes = new Hono();

// List all users (admin only)
userRoutes.get('/', auth, adminOnly, async (c) => {
  try {
    const users = await userService.findAll();
    return c.json({ users });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list users';
    return c.json({ error: message }, 500);
  }
});

// Get user by ID (admin only)
userRoutes.get('/:id', auth, adminOnly, async (c) => {
  try {
    const id = c.req.param('id');
    const user = await userService.findById(id);

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get user';
    return c.json({ error: message }, 500);
  }
});

// Create user (admin only)
userRoutes.post(
  '/',
  auth,
  adminOnly,
  zValidator('json', CreateUserSchema),
  async (c) => {
    try {
      const input = c.req.valid('json');
      const user = await userService.create(input);
      return c.json({ user }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create user';
      return c.json({ error: message }, 400);
    }
  }
);

// Update user (admin only)
userRoutes.put(
  '/:id',
  auth,
  adminOnly,
  zValidator('json', UpdateUserSchema),
  async (c) => {
    try {
      const id = c.req.param('id');
      const input = c.req.valid('json');

      const existing = await userService.findById(id);
      if (!existing) {
        return c.json({ error: 'User not found' }, 404);
      }

      const user = await userService.update(id, input);
      return c.json({ user });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update user';
      return c.json({ error: message }, 400);
    }
  }
);

// Delete user (admin only)
userRoutes.delete('/:id', auth, adminOnly, async (c) => {
  try {
    const id = c.req.param('id');
    const session = requireSession(c);

    // Prevent self-deletion
    if (id === session.user.id) {
      return c.json({ error: 'Cannot delete your own account' }, 400);
    }

    const existing = await userService.findById(id);
    if (!existing) {
      return c.json({ error: 'User not found' }, 404);
    }

    await userService.delete(id);
    return c.json({ message: 'User deleted' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete user';
    return c.json({ error: message }, 400);
  }
});

// List API keys for user (admin only)
userRoutes.get('/:id/api-keys', auth, adminOnly, async (c) => {
  try {
    const id = c.req.param('id');
    const apiKeys = await userService.listApiKeys(id);
    return c.json({ apiKeys });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list API keys';
    return c.json({ error: message }, 400);
  }
});

// Create API key for user (admin only)
userRoutes.post(
  '/:id/api-keys',
  auth,
  adminOnly,
  zValidator('json', CreateApiKeySchema),
  async (c) => {
    try {
      const id = c.req.param('id');
      const input = c.req.valid('json');

      const result = await userService.createApiKey(id, input);
      return c.json(
        {
          apiKey: result.apiKey,
          key: result.key,
          message: 'Save this key - it will not be shown again',
        },
        201
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create API key';
      return c.json({ error: message }, 400);
    }
  }
);

// Revoke API key (admin only)
userRoutes.delete('/:userId/api-keys/:keyId', auth, adminOnly, async (c) => {
  try {
    const userId = c.req.param('userId');
    const keyId = c.req.param('keyId');

    await userService.revokeApiKey(userId, keyId);
    return c.json({ message: 'API key revoked' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to revoke API key';
    return c.json({ error: message }, 400);
  }
});

export { userRoutes };
