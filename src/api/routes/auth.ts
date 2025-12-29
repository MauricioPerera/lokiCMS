/**
 * Auth Routes
 * Login, register, token refresh, and API key management
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { userService } from '../../services/index.js';
import {
  LoginSchema,
  CreateUserSchema,
  CreateApiKeySchema,
} from '../../models/index.js';
import { auth, requireSession } from '../middleware/auth.js';
import { z } from 'zod';

const authRoutes = new Hono();

// Register new user
authRoutes.post(
  '/register',
  zValidator('json', CreateUserSchema),
  async (c) => {
    try {
      const input = c.req.valid('json');
      const user = await userService.create(input);
      return c.json({ user }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      return c.json({ error: message }, 400);
    }
  }
);

// Login
authRoutes.post(
  '/login',
  zValidator('json', LoginSchema),
  async (c) => {
    try {
      const input = c.req.valid('json');
      const result = await userService.login(input);
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      return c.json({ error: message }, 401);
    }
  }
);

// Refresh token
authRoutes.post('/refresh', async (c) => {
  try {
    const body = await c.req.json();
    const { refreshToken } = body as { refreshToken: string };

    if (!refreshToken) {
      return c.json({ error: 'Refresh token required' }, 400);
    }

    const result = await userService.refreshToken(refreshToken);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token refresh failed';
    return c.json({ error: message }, 401);
  }
});

// Get current user
authRoutes.get('/me', auth, async (c) => {
  const session = requireSession(c);
  return c.json({ user: session.user, permissions: session.permissions });
});

// Change password
authRoutes.post(
  '/change-password',
  auth,
  zValidator(
    'json',
    z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8).max(128),
    })
  ),
  async (c) => {
    try {
      const session = requireSession(c);
      const { currentPassword, newPassword } = c.req.valid('json');

      await userService.changePassword(session.user.id, currentPassword, newPassword);
      return c.json({ message: 'Password changed successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Password change failed';
      return c.json({ error: message }, 400);
    }
  }
);

// List API keys
authRoutes.get('/api-keys', auth, async (c) => {
  try {
    const session = requireSession(c);
    const apiKeys = await userService.listApiKeys(session.user.id);
    return c.json({ apiKeys });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list API keys';
    return c.json({ error: message }, 400);
  }
});

// Create API key
authRoutes.post(
  '/api-keys',
  auth,
  zValidator('json', CreateApiKeySchema),
  async (c) => {
    try {
      const session = requireSession(c);
      const input = c.req.valid('json');

      const result = await userService.createApiKey(session.user.id, input);
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

// Revoke API key
authRoutes.delete('/api-keys/:id', auth, async (c) => {
  try {
    const session = requireSession(c);
    const apiKeyId = c.req.param('id');

    await userService.revokeApiKey(session.user.id, apiKeyId);
    return c.json({ message: 'API key revoked' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to revoke API key';
    return c.json({ error: message }, 400);
  }
});

export { authRoutes };
