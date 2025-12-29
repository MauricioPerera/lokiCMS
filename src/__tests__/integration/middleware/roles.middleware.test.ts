/**
 * Roles Middleware Tests
 * Tests for role-based access control
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  requireRole,
  requirePermission,
  requireAnyPermission,
  hasPermission,
  canAccessOwned,
  adminOnly,
  editorOrHigher,
  authorOrHigher,
} from '../../../api/middleware/roles.js';
import type { SessionInfo } from '../../../models/index.js';

describe('Roles Middleware', () => {
  let app: Hono;

  const createSession = (
    role: 'admin' | 'editor' | 'author' | 'viewer',
    permissions: string[] = [],
    userId: string = 'user-1'
  ): SessionInfo => ({
    user: {
      id: userId,
      email: `${role}@example.com`,
      name: `${role} User`,
      role,
      isActive: true,
      emailVerified: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    permissions,
  });

  beforeEach(() => {
    app = new Hono();
  });

  // Helper to set session
  const setSession = (session: SessionInfo | undefined) => {
    return async (c: any, next: any) => {
      if (session) {
        c.set('session', session);
      }
      return next();
    };
  };

  // ============================================================================
  // requireRole
  // ============================================================================

  describe('requireRole', () => {
    it('should allow user with matching role', async () => {
      app.use('/*', setSession(createSession('admin', [])));
      app.use('/*', requireRole('admin'));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(200);
    });

    it('should allow user with one of multiple roles', async () => {
      app.use('/*', setSession(createSession('editor', [])));
      app.use('/*', requireRole('admin', 'editor'));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(200);
    });

    it('should reject user without matching role', async () => {
      app.use('/*', setSession(createSession('viewer', [])));
      app.use('/*', requireRole('admin'));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('Insufficient permissions');
    });

    it('should return 401 when not authenticated', async () => {
      app.use('/*', setSession(undefined));
      app.use('/*', requireRole('admin'));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Authentication required');
    });
  });

  // ============================================================================
  // requirePermission
  // ============================================================================

  describe('requirePermission', () => {
    it('should allow user with exact permission', async () => {
      app.use('/*', setSession(createSession('editor', ['entries:read'])));
      app.use('/*', requirePermission('entries:read'));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(200);
    });

    it('should allow user with all required permissions', async () => {
      app.use(
        '/*',
        setSession(createSession('editor', ['entries:read', 'entries:create']))
      );
      app.use('/*', requirePermission('entries:read', 'entries:create'));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(200);
    });

    it('should reject user missing one permission', async () => {
      app.use('/*', setSession(createSession('editor', ['entries:read'])));
      app.use('/*', requirePermission('entries:read', 'entries:delete'));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(403);
    });

    it('should allow wildcard permission match', async () => {
      app.use('/*', setSession(createSession('admin', ['entries:read'])));
      app.use('/*', requirePermission('entries:read:published'));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      // entries:read should match entries:read:published
      expect(res.status).toBe(200);
    });

    it('should return 401 when not authenticated', async () => {
      app.use('/*', setSession(undefined));
      app.use('/*', requirePermission('entries:read'));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(401);
    });
  });

  // ============================================================================
  // requireAnyPermission
  // ============================================================================

  describe('requireAnyPermission', () => {
    it('should allow user with any of the permissions', async () => {
      app.use('/*', setSession(createSession('editor', ['entries:create'])));
      app.use('/*', requireAnyPermission('entries:read', 'entries:create'));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(200);
    });

    it('should reject user with none of the permissions', async () => {
      app.use('/*', setSession(createSession('viewer', ['entries:read'])));
      app.use('/*', requireAnyPermission('entries:delete', 'entries:create'));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(403);
    });

    it('should allow wildcard permission match', async () => {
      app.use('/*', setSession(createSession('editor', ['entries:delete'])));
      app.use('/*', requireAnyPermission('entries:delete:own', 'users:manage'));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(200);
    });

    it('should return 401 when not authenticated', async () => {
      app.use('/*', setSession(undefined));
      app.use('/*', requireAnyPermission('entries:read'));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(401);
    });
  });

  // ============================================================================
  // hasPermission Helper
  // ============================================================================

  describe('hasPermission', () => {
    it('should return true for exact permission match', async () => {
      app.use('/*', setSession(createSession('editor', ['entries:read'])));
      app.get('/test', (c) => {
        return c.json({ has: hasPermission(c, 'entries:read') });
      });

      const res = await app.request('/test');
      const data = await res.json();

      expect(data.has).toBe(true);
    });

    it('should return true for wildcard match', async () => {
      app.use('/*', setSession(createSession('editor', ['entries:read'])));
      app.get('/test', (c) => {
        return c.json({ has: hasPermission(c, 'entries:read:published') });
      });

      const res = await app.request('/test');
      const data = await res.json();

      expect(data.has).toBe(true);
    });

    it('should return false for missing permission', async () => {
      app.use('/*', setSession(createSession('viewer', ['entries:read'])));
      app.get('/test', (c) => {
        return c.json({ has: hasPermission(c, 'entries:delete') });
      });

      const res = await app.request('/test');
      const data = await res.json();

      expect(data.has).toBe(false);
    });

    it('should return false when not authenticated', async () => {
      app.get('/test', (c) => {
        return c.json({ has: hasPermission(c, 'entries:read') });
      });

      const res = await app.request('/test');
      const data = await res.json();

      expect(data.has).toBe(false);
    });
  });

  // ============================================================================
  // canAccessOwned Helper
  // ============================================================================

  describe('canAccessOwned', () => {
    it('should return true with full permission regardless of owner', async () => {
      app.use('/*', setSession(createSession('admin', ['entries:delete'], 'user-1')));
      app.get('/test', (c) => {
        return c.json({
          can: canAccessOwned(c, 'entries:delete', 'user-2'), // Different owner
        });
      });

      const res = await app.request('/test');
      const data = await res.json();

      expect(data.can).toBe(true);
    });

    it('should return true with :own permission when user is owner', async () => {
      app.use(
        '/*',
        setSession(createSession('author', ['entries:delete:own'], 'user-1'))
      );
      app.get('/test', (c) => {
        return c.json({
          can: canAccessOwned(c, 'entries:delete', 'user-1'), // Same owner
        });
      });

      const res = await app.request('/test');
      const data = await res.json();

      expect(data.can).toBe(true);
    });

    it('should return false with :own permission when user is not owner', async () => {
      app.use(
        '/*',
        setSession(createSession('author', ['entries:delete:own'], 'user-1'))
      );
      app.get('/test', (c) => {
        return c.json({
          can: canAccessOwned(c, 'entries:delete', 'user-2'), // Different owner
        });
      });

      const res = await app.request('/test');
      const data = await res.json();

      expect(data.can).toBe(false);
    });

    it('should return false without any matching permission', async () => {
      app.use('/*', setSession(createSession('viewer', ['entries:read'], 'user-1')));
      app.get('/test', (c) => {
        return c.json({
          can: canAccessOwned(c, 'entries:delete', 'user-1'),
        });
      });

      const res = await app.request('/test');
      const data = await res.json();

      expect(data.can).toBe(false);
    });

    it('should return false when not authenticated', async () => {
      app.get('/test', (c) => {
        return c.json({
          can: canAccessOwned(c, 'entries:delete', 'user-1'),
        });
      });

      const res = await app.request('/test');
      const data = await res.json();

      expect(data.can).toBe(false);
    });
  });

  // ============================================================================
  // Preset Middlewares
  // ============================================================================

  describe('adminOnly', () => {
    it('should allow admin', async () => {
      app.use('/*', setSession(createSession('admin', [])));
      app.use('/*', adminOnly);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(200);
    });

    it('should reject editor', async () => {
      app.use('/*', setSession(createSession('editor', [])));
      app.use('/*', adminOnly);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(403);
    });

    it('should reject author', async () => {
      app.use('/*', setSession(createSession('author', [])));
      app.use('/*', adminOnly);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(403);
    });

    it('should reject viewer', async () => {
      app.use('/*', setSession(createSession('viewer', [])));
      app.use('/*', adminOnly);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(403);
    });
  });

  describe('editorOrHigher', () => {
    it('should allow admin', async () => {
      app.use('/*', setSession(createSession('admin', [])));
      app.use('/*', editorOrHigher);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(200);
    });

    it('should allow editor', async () => {
      app.use('/*', setSession(createSession('editor', [])));
      app.use('/*', editorOrHigher);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(200);
    });

    it('should reject author', async () => {
      app.use('/*', setSession(createSession('author', [])));
      app.use('/*', editorOrHigher);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(403);
    });

    it('should reject viewer', async () => {
      app.use('/*', setSession(createSession('viewer', [])));
      app.use('/*', editorOrHigher);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(403);
    });
  });

  describe('authorOrHigher', () => {
    it('should allow admin', async () => {
      app.use('/*', setSession(createSession('admin', [])));
      app.use('/*', authorOrHigher);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(200);
    });

    it('should allow editor', async () => {
      app.use('/*', setSession(createSession('editor', [])));
      app.use('/*', authorOrHigher);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(200);
    });

    it('should allow author', async () => {
      app.use('/*', setSession(createSession('author', [])));
      app.use('/*', authorOrHigher);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(200);
    });

    it('should reject viewer', async () => {
      app.use('/*', setSession(createSession('viewer', [])));
      app.use('/*', authorOrHigher);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(403);
    });
  });

  // ============================================================================
  // Middleware Chaining
  // ============================================================================

  describe('middleware chaining', () => {
    it('should work with multiple middleware', async () => {
      app.use('/*', setSession(createSession('admin', ['entries:delete'])));
      app.use('/*', requireRole('admin'));
      app.use('/*', requirePermission('entries:delete'));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(200);
    });

    it('should fail at first failing middleware', async () => {
      app.use('/*', setSession(createSession('editor', ['entries:delete'])));
      app.use('/*', requireRole('admin')); // This will fail
      app.use('/*', requirePermission('entries:delete'));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(403);
    });
  });
});
