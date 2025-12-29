/**
 * Authentication Middleware
 * JWT and API Key validation
 */

import { createMiddleware } from 'hono/factory';
import type { Context, Next } from 'hono';
import { userService } from '../../services/index.js';
import type { SessionInfo } from '../../models/index.js';

// Extend Hono context with session
declare module 'hono' {
  interface ContextVariableMap {
    session: SessionInfo;
  }
}

// Auth middleware - requires authentication
export const auth = createMiddleware(async (c: Context, next: Next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    return c.json({ error: 'Authorization header required' }, 401);
  }

  try {
    // Check for Bearer token (JWT)
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = await userService.verifyToken(token);

      if (payload.type !== 'access') {
        return c.json({ error: 'Invalid token type' }, 401);
      }

      const session = await userService.getSessionFromPayload(payload);
      c.set('session', session);
      return next();
    }

    // Check for API key
    if (authHeader.startsWith('ApiKey ')) {
      const apiKey = authHeader.substring(7);
      const session = await userService.verifyApiKey(apiKey);

      if (!session) {
        return c.json({ error: 'Invalid API key' }, 401);
      }

      c.set('session', session);
      return next();
    }

    return c.json({ error: 'Invalid authorization format' }, 401);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    return c.json({ error: message }, 401);
  }
});

// Optional auth middleware - sets session if authenticated but doesn't require it
export const optionalAuth = createMiddleware(async (c: Context, next: Next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    return next();
  }

  try {
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = await userService.verifyToken(token);

      if (payload.type === 'access') {
        const session = await userService.getSessionFromPayload(payload);
        c.set('session', session);
      }
    } else if (authHeader.startsWith('ApiKey ')) {
      const apiKey = authHeader.substring(7);
      const session = await userService.verifyApiKey(apiKey);

      if (session) {
        c.set('session', session);
      }
    }
  } catch {
    // Ignore errors in optional auth
  }

  return next();
});

// Get current session (may be undefined if optionalAuth was used)
export function getSession(c: Context): SessionInfo | undefined {
  return c.get('session');
}

// Get current session (throws if not authenticated)
export function requireSession(c: Context): SessionInfo {
  const session = c.get('session');
  if (!session) {
    throw new Error('Authentication required');
  }
  return session;
}
