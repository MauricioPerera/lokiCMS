/**
 * Auth Middleware Tests
 * Tests for JWT and API key authentication
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { auth, optionalAuth, getSession, requireSession } from '../../../api/middleware/auth.js';
import type { SessionInfo } from '../../../models/index.js';

// Mock the user service
vi.mock('../../../services/index.js', () => ({
  userService: {
    verifyToken: vi.fn(),
    verifyApiKey: vi.fn(),
    getSessionFromPayload: vi.fn(),
  },
}));

import { userService } from '../../../services/index.js';

describe('Auth Middleware', () => {
  let app: Hono;

  const mockSession: SessionInfo = {
    user: {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'editor',
      isActive: true,
      emailVerified: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    permissions: ['entries:read', 'entries:create', 'entries:update'],
  };

  beforeEach(() => {
    app = new Hono();
    vi.clearAllMocks();
  });

  // ============================================================================
  // auth Middleware (Required Authentication)
  // ============================================================================

  describe('auth (required)', () => {
    beforeEach(() => {
      app.use('/protected/*', auth);
      app.get('/protected/resource', (c) => {
        const session = c.get('session');
        return c.json({ userId: session.user.id });
      });
    });

    describe('Bearer token (JWT)', () => {
      it('should authenticate with valid Bearer token', async () => {
        vi.mocked(userService.verifyToken).mockResolvedValue({
          sub: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          role: 'editor',
          type: 'access',
        });
        vi.mocked(userService.getSessionFromPayload).mockResolvedValue(mockSession);

        const res = await app.request('/protected/resource', {
          headers: { Authorization: 'Bearer valid-token' },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.userId).toBe('user-1');
      });

      it('should reject invalid Bearer token', async () => {
        vi.mocked(userService.verifyToken).mockRejectedValue(
          new Error('Invalid or expired token')
        );

        const res = await app.request('/protected/resource', {
          headers: { Authorization: 'Bearer invalid-token' },
        });

        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.error).toBe('Invalid or expired token');
      });

      it('should reject refresh token used as access token', async () => {
        vi.mocked(userService.verifyToken).mockResolvedValue({
          sub: 'user-1',
          type: 'refresh',
        });

        const res = await app.request('/protected/resource', {
          headers: { Authorization: 'Bearer refresh-token' },
        });

        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.error).toBe('Invalid token type');
      });

      it('should reject expired token', async () => {
        vi.mocked(userService.verifyToken).mockRejectedValue(
          new Error('Invalid or expired token')
        );

        const res = await app.request('/protected/resource', {
          headers: { Authorization: 'Bearer expired-token' },
        });

        expect(res.status).toBe(401);
      });
    });

    describe('API Key', () => {
      it('should authenticate with valid API key', async () => {
        vi.mocked(userService.verifyApiKey).mockResolvedValue(mockSession);

        const res = await app.request('/protected/resource', {
          headers: { Authorization: 'ApiKey lkcms_validkey123' },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.userId).toBe('user-1');
      });

      it('should reject invalid API key', async () => {
        vi.mocked(userService.verifyApiKey).mockResolvedValue(null);

        const res = await app.request('/protected/resource', {
          headers: { Authorization: 'ApiKey invalid-key' },
        });

        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.error).toBe('Invalid API key');
      });

      it('should reject expired API key', async () => {
        vi.mocked(userService.verifyApiKey).mockResolvedValue(null);

        const res = await app.request('/protected/resource', {
          headers: { Authorization: 'ApiKey expired-key' },
        });

        expect(res.status).toBe(401);
      });
    });

    describe('Missing/Invalid Authorization', () => {
      it('should reject request without Authorization header', async () => {
        const res = await app.request('/protected/resource');

        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.error).toBe('Authorization header required');
      });

      it('should reject unsupported authorization format', async () => {
        const res = await app.request('/protected/resource', {
          headers: { Authorization: 'Basic dXNlcjpwYXNz' },
        });

        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.error).toBe('Invalid authorization format');
      });

      it('should reject empty Authorization header', async () => {
        const res = await app.request('/protected/resource', {
          headers: { Authorization: '' },
        });

        expect(res.status).toBe(401);
      });

      it('should reject Bearer without token', async () => {
        const res = await app.request('/protected/resource', {
          headers: { Authorization: 'Bearer ' },
        });

        expect(res.status).toBe(401);
      });
    });
  });

  // ============================================================================
  // optionalAuth Middleware
  // ============================================================================

  describe('optionalAuth', () => {
    beforeEach(() => {
      app.use('/public/*', optionalAuth);
      app.get('/public/resource', (c) => {
        const session = c.get('session');
        return c.json({
          authenticated: !!session,
          userId: session?.user.id ?? null,
        });
      });
    });

    it('should allow request without authentication', async () => {
      const res = await app.request('/public/resource');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.authenticated).toBe(false);
      expect(data.userId).toBeNull();
    });

    it('should set session when valid token provided', async () => {
      vi.mocked(userService.verifyToken).mockResolvedValue({
        sub: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'editor',
        type: 'access',
      });
      vi.mocked(userService.getSessionFromPayload).mockResolvedValue(mockSession);

      const res = await app.request('/public/resource', {
        headers: { Authorization: 'Bearer valid-token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.authenticated).toBe(true);
      expect(data.userId).toBe('user-1');
    });

    it('should set session when valid API key provided', async () => {
      vi.mocked(userService.verifyApiKey).mockResolvedValue(mockSession);

      const res = await app.request('/public/resource', {
        headers: { Authorization: 'ApiKey lkcms_validkey' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.authenticated).toBe(true);
    });

    it('should ignore invalid token silently', async () => {
      vi.mocked(userService.verifyToken).mockRejectedValue(
        new Error('Invalid token')
      );

      const res = await app.request('/public/resource', {
        headers: { Authorization: 'Bearer invalid-token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.authenticated).toBe(false);
    });

    it('should ignore invalid API key silently', async () => {
      vi.mocked(userService.verifyApiKey).mockResolvedValue(null);

      const res = await app.request('/public/resource', {
        headers: { Authorization: 'ApiKey invalid-key' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.authenticated).toBe(false);
    });

    it('should not set session for refresh token', async () => {
      vi.mocked(userService.verifyToken).mockResolvedValue({
        sub: 'user-1',
        type: 'refresh',
      });

      const res = await app.request('/public/resource', {
        headers: { Authorization: 'Bearer refresh-token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.authenticated).toBe(false);
    });
  });

  // ============================================================================
  // Helper Functions
  // ============================================================================

  describe('getSession', () => {
    it('should return session when authenticated', async () => {
      app.use('/*', auth);
      app.get('/test', (c) => {
        const session = getSession(c);
        return c.json({ hasSession: !!session });
      });

      vi.mocked(userService.verifyToken).mockResolvedValue({
        sub: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'editor',
        type: 'access',
      });
      vi.mocked(userService.getSessionFromPayload).mockResolvedValue(mockSession);

      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer token' },
      });

      const data = await res.json();
      expect(data.hasSession).toBe(true);
    });

    it('should return undefined when not authenticated', async () => {
      app.get('/test', (c) => {
        const session = getSession(c);
        return c.json({ hasSession: !!session });
      });

      const res = await app.request('/test');
      const data = await res.json();
      expect(data.hasSession).toBe(false);
    });
  });

  describe('requireSession', () => {
    it('should return session when authenticated', async () => {
      app.use('/*', auth);
      app.get('/test', (c) => {
        const session = requireSession(c);
        return c.json({ userId: session.user.id });
      });

      vi.mocked(userService.verifyToken).mockResolvedValue({
        sub: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'editor',
        type: 'access',
      });
      vi.mocked(userService.getSessionFromPayload).mockResolvedValue(mockSession);

      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer token' },
      });

      expect(res.status).toBe(200);
    });

    it('should throw error when not authenticated', async () => {
      app.get('/test', (c) => {
        try {
          requireSession(c);
          return c.json({ error: 'Should have thrown' });
        } catch (e) {
          return c.json({ error: (e as Error).message }, 401);
        }
      });

      const res = await app.request('/test');
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Authentication required');
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    beforeEach(() => {
      app.use('/protected/*', auth);
      app.get('/protected/resource', (c) => c.json({ ok: true }));
    });

    it('should handle malformed Bearer token format', async () => {
      vi.mocked(userService.verifyToken).mockRejectedValue(
        new Error('Invalid token format')
      );

      const res = await app.request('/protected/resource', {
        headers: { Authorization: 'Bearer not.a.valid.jwt' },
      });

      expect(res.status).toBe(401);
    });

    it('should handle service errors gracefully', async () => {
      vi.mocked(userService.verifyToken).mockResolvedValue({
        sub: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'editor',
        type: 'access',
      });
      vi.mocked(userService.getSessionFromPayload).mockRejectedValue(
        new Error('User not found')
      );

      const res = await app.request('/protected/resource', {
        headers: { Authorization: 'Bearer valid-format-token' },
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('User not found');
    });

    it('should handle case sensitivity in header names', async () => {
      vi.mocked(userService.verifyToken).mockResolvedValue({
        sub: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'editor',
        type: 'access',
      });
      vi.mocked(userService.getSessionFromPayload).mockResolvedValue(mockSession);

      // Headers are case-insensitive in HTTP
      const res = await app.request('/protected/resource', {
        headers: { authorization: 'Bearer valid-token' },
      });

      expect(res.status).toBe(200);
    });
  });
});
