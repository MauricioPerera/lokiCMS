/**
 * Auth Routes Tests
 * Tests for authentication endpoints
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { authRoutes } from '../../../api/routes/auth.js';
import type { SessionInfo } from '../../../models/index.js';

// Mock the user service
vi.mock('../../../services/index.js', () => ({
  userService: {
    create: vi.fn(),
    login: vi.fn(),
    refreshToken: vi.fn(),
    verifyToken: vi.fn(),
    getSessionFromPayload: vi.fn(),
    changePassword: vi.fn(),
    listApiKeys: vi.fn(),
    createApiKey: vi.fn(),
    revokeApiKey: vi.fn(),
  },
}));

import { userService } from '../../../services/index.js';

describe('Auth Routes', () => {
  let app: Hono;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    role: 'editor' as const,
    isActive: true,
    emailVerified: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const mockSession: SessionInfo = {
    user: mockUser,
    permissions: ['entries:read', 'entries:create'],
  };

  beforeEach(() => {
    app = new Hono();
    app.route('/auth', authRoutes);
    vi.clearAllMocks();
  });

  // ============================================================================
  // Register
  // ============================================================================

  describe('POST /auth/register', () => {
    it('should register a new user', async () => {
      vi.mocked(userService.create).mockResolvedValue(mockUser);

      const res = await app.request('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'SecurePass123!',
          name: 'Test User',
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.user.email).toBe('test@example.com');
    });

    it('should return 400 for invalid input', async () => {
      const res = await app.request('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invalid-email',
          password: 'short',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 for duplicate email', async () => {
      vi.mocked(userService.create).mockRejectedValue(
        new Error('Email already registered')
      );

      const res = await app.request('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'existing@example.com',
          password: 'SecurePass123!',
          name: 'Test User',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Email already registered');
    });

    it('should register user with optional role', async () => {
      vi.mocked(userService.create).mockResolvedValue({
        ...mockUser,
        role: 'author',
      });

      const res = await app.request('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'SecurePass123!',
          name: 'Test User',
          role: 'author',
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.user.role).toBe('author');
    });
  });

  // ============================================================================
  // Login
  // ============================================================================

  describe('POST /auth/login', () => {
    it('should login with valid credentials', async () => {
      vi.mocked(userService.login).mockResolvedValue({
        user: mockUser,
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'SecurePass123!',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.user.email).toBe('test@example.com');
      expect(data.accessToken).toBe('access-token');
      expect(data.refreshToken).toBe('refresh-token');
    });

    it('should return 401 for invalid credentials', async () => {
      vi.mocked(userService.login).mockRejectedValue(
        new Error('Invalid email or password')
      );

      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'WrongPassword!',
        }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Invalid email or password');
    });

    it('should return 400 for invalid input', async () => {
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invalid-email',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 401 for disabled account', async () => {
      vi.mocked(userService.login).mockRejectedValue(
        new Error('Account is disabled')
      );

      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'disabled@example.com',
          password: 'Password123!',
        }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Account is disabled');
    });
  });

  // ============================================================================
  // Refresh Token
  // ============================================================================

  describe('POST /auth/refresh', () => {
    it('should refresh access token', async () => {
      vi.mocked(userService.refreshToken).mockResolvedValue({
        accessToken: 'new-access-token',
      });

      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: 'valid-refresh-token',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.accessToken).toBe('new-access-token');
    });

    it('should return 400 without refresh token', async () => {
      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Refresh token required');
    });

    it('should return 401 for invalid refresh token', async () => {
      vi.mocked(userService.refreshToken).mockRejectedValue(
        new Error('Invalid or expired token')
      );

      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: 'invalid-token',
        }),
      });

      expect(res.status).toBe(401);
    });
  });

  // ============================================================================
  // Get Current User
  // ============================================================================

  describe('GET /auth/me', () => {
    beforeEach(() => {
      vi.mocked(userService.verifyToken).mockResolvedValue({
        sub: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'editor',
        type: 'access',
      });
      vi.mocked(userService.getSessionFromPayload).mockResolvedValue(mockSession);
    });

    it('should return current user', async () => {
      const res = await app.request('/auth/me', {
        headers: { Authorization: 'Bearer valid-token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.user.email).toBe('test@example.com');
      expect(data.permissions).toContain('entries:read');
    });

    it('should return 401 without authentication', async () => {
      const res = await app.request('/auth/me');

      expect(res.status).toBe(401);
    });
  });

  // ============================================================================
  // Change Password
  // ============================================================================

  describe('POST /auth/change-password', () => {
    beforeEach(() => {
      vi.mocked(userService.verifyToken).mockResolvedValue({
        sub: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'editor',
        type: 'access',
      });
      vi.mocked(userService.getSessionFromPayload).mockResolvedValue(mockSession);
    });

    it('should change password', async () => {
      vi.mocked(userService.changePassword).mockResolvedValue();

      const res = await app.request('/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toBe('Password changed successfully');
    });

    it('should return 400 for incorrect current password', async () => {
      vi.mocked(userService.changePassword).mockRejectedValue(
        new Error('Current password is incorrect')
      );

      const res = await app.request('/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          currentPassword: 'WrongPassword!',
          newPassword: 'NewPassword123!',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Current password is incorrect');
    });

    it('should return 400 for too short new password', async () => {
      const res = await app.request('/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          currentPassword: 'OldPassword123!',
          newPassword: 'short',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 401 without authentication', async () => {
      vi.mocked(userService.verifyToken).mockRejectedValue(
        new Error('Invalid token')
      );

      const res = await app.request('/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!',
        }),
      });

      expect(res.status).toBe(401);
    });
  });

  // ============================================================================
  // API Keys
  // ============================================================================

  describe('GET /auth/api-keys', () => {
    beforeEach(() => {
      vi.mocked(userService.verifyToken).mockResolvedValue({
        sub: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'editor',
        type: 'access',
      });
      vi.mocked(userService.getSessionFromPayload).mockResolvedValue(mockSession);
    });

    it('should list API keys', async () => {
      vi.mocked(userService.listApiKeys).mockResolvedValue([
        {
          id: 'key-1',
          name: 'Test Key',
          keyPrefix: 'lkcms_abc',
          permissions: [],
          createdAt: Date.now(),
        },
      ]);

      const res = await app.request('/auth/api-keys', {
        headers: { Authorization: 'Bearer valid-token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.apiKeys).toHaveLength(1);
      expect(data.apiKeys[0].name).toBe('Test Key');
    });

    it('should return 401 without authentication', async () => {
      vi.mocked(userService.verifyToken).mockRejectedValue(
        new Error('Invalid token')
      );

      const res = await app.request('/auth/api-keys');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/api-keys', () => {
    beforeEach(() => {
      vi.mocked(userService.verifyToken).mockResolvedValue({
        sub: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'editor',
        type: 'access',
      });
      vi.mocked(userService.getSessionFromPayload).mockResolvedValue(mockSession);
    });

    it('should create API key', async () => {
      vi.mocked(userService.createApiKey).mockResolvedValue({
        apiKey: {
          id: 'key-1',
          name: 'New Key',
          keyHash: 'hash',
          keyPrefix: 'lkcms_abc',
          permissions: [],
          createdAt: Date.now(),
        },
        key: 'lkcms_full_key_here',
      });

      const res = await app.request('/auth/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          name: 'New Key',
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.key).toBe('lkcms_full_key_here');
      expect(data.message).toContain('Save this key');
    });

    it('should create API key with permissions', async () => {
      vi.mocked(userService.createApiKey).mockResolvedValue({
        apiKey: {
          id: 'key-1',
          name: 'Limited Key',
          keyHash: 'hash',
          keyPrefix: 'lkcms_abc',
          permissions: ['entries:read'],
          createdAt: Date.now(),
        },
        key: 'lkcms_limited_key',
      });

      const res = await app.request('/auth/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          name: 'Limited Key',
          permissions: ['entries:read'],
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.apiKey.permissions).toContain('entries:read');
    });

    it('should return 400 without name', async () => {
      const res = await app.request('/auth/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /auth/api-keys/:id', () => {
    beforeEach(() => {
      vi.mocked(userService.verifyToken).mockResolvedValue({
        sub: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'editor',
        type: 'access',
      });
      vi.mocked(userService.getSessionFromPayload).mockResolvedValue(mockSession);
    });

    it('should revoke API key', async () => {
      vi.mocked(userService.revokeApiKey).mockResolvedValue();

      const res = await app.request('/auth/api-keys/key-1', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer valid-token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toBe('API key revoked');
    });

    it('should return 400 for non-existent key', async () => {
      vi.mocked(userService.revokeApiKey).mockRejectedValue(
        new Error('API key not found')
      );

      const res = await app.request('/auth/api-keys/nonexistent', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer valid-token' },
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('API key not found');
    });

    it('should return 401 without authentication', async () => {
      vi.mocked(userService.verifyToken).mockRejectedValue(
        new Error('Invalid token')
      );

      const res = await app.request('/auth/api-keys/key-1', {
        method: 'DELETE',
      });

      expect(res.status).toBe(401);
    });
  });
});
