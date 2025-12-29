/**
 * UserService Tests
 * Tests for user management, authentication, and authorization
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../../utils/test-db.js';
import { createUser, createAdminUser, createEditorUser } from '../../utils/factories/user.factory.js';

// Mock the database module
vi.mock('../../../db/index.js', () => ({
  getUsersCollection: vi.fn(),
}));

import { getUsersCollection } from '../../../db/index.js';
import { UserService } from '../../../services/user.service.js';

describe('UserService', () => {
  let testDb: TestDatabase;
  let userService: UserService;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    vi.mocked(getUsersCollection).mockReturnValue(testDb.users as any);
    userService = new UserService();
  });

  afterEach(async () => {
    await testDb.cleanup();
    vi.clearAllMocks();
  });

  // ============================================================================
  // User Creation
  // ============================================================================

  describe('create', () => {
    it('should create a new user with valid input', async () => {
      const input = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: 'Test User',
      };

      const user = await userService.create(input);

      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
      expect(user.role).toBe('viewer'); // default role
      expect(user.isActive).toBe(true);
      expect(user).not.toHaveProperty('passwordHash');
    });

    it('should normalize email to lowercase', async () => {
      const user = await userService.create({
        email: 'TEST@EXAMPLE.COM',
        password: 'SecurePass123!',
        name: 'Test User',
      });

      expect(user.email).toBe('test@example.com');
    });

    it('should create user with specified role', async () => {
      const user = await userService.create({
        email: 'admin@example.com',
        password: 'SecurePass123!',
        name: 'Admin User',
        role: 'admin',
      });

      expect(user.role).toBe('admin');
    });

    it('should throw error for duplicate email', async () => {
      await userService.create({
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: 'First User',
      });

      await expect(
        userService.create({
          email: 'test@example.com',
          password: 'AnotherPass123!',
          name: 'Second User',
        })
      ).rejects.toThrow('Email already registered');
    });

    it('should throw error for duplicate email (case insensitive)', async () => {
      await userService.create({
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: 'First User',
      });

      await expect(
        userService.create({
          email: 'TEST@EXAMPLE.COM',
          password: 'AnotherPass123!',
          name: 'Second User',
        })
      ).rejects.toThrow('Email already registered');
    });

    it('should generate unique ID for each user', async () => {
      const user1 = await userService.create({
        email: 'user1@example.com',
        password: 'SecurePass123!',
        name: 'User One',
      });

      const user2 = await userService.create({
        email: 'user2@example.com',
        password: 'SecurePass123!',
        name: 'User Two',
      });

      expect(user1.id).not.toBe(user2.id);
    });

    it('should set timestamps on creation', async () => {
      const before = Date.now();
      const user = await userService.create({
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: 'Test User',
      });
      const after = Date.now();

      expect(user.createdAt).toBeGreaterThanOrEqual(before);
      expect(user.createdAt).toBeLessThanOrEqual(after);
      expect(user.updatedAt).toBeGreaterThanOrEqual(before);
      expect(user.updatedAt).toBeLessThanOrEqual(after);
    });

    it('should create user with optional fields', async () => {
      const user = await userService.create({
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: 'Test User',
        avatar: 'https://example.com/avatar.jpg',
        bio: 'A test user biography',
      });

      expect(user.avatar).toBe('https://example.com/avatar.jpg');
      expect(user.bio).toBe('A test user biography');
    });

    it('should initialize apiKeys as empty array', async () => {
      const user = await userService.create({
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: 'Test User',
      });

      // Note: apiKeys is not exposed in SafeUser, but we can check via collection
      const doc = testDb.users.findOne({ id: user.id });
      expect(doc?.apiKeys).toEqual([]);
    });
  });

  // ============================================================================
  // User Login
  // ============================================================================

  describe('login', () => {
    beforeEach(async () => {
      await userService.create({
        email: 'login@example.com',
        password: 'CorrectPassword123!',
        name: 'Login User',
      });
    });

    it('should login with correct credentials', async () => {
      const result = await userService.login({
        email: 'login@example.com',
        password: 'CorrectPassword123!',
      });

      expect(result.user.email).toBe('login@example.com');
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('should return different access and refresh tokens', async () => {
      const result = await userService.login({
        email: 'login@example.com',
        password: 'CorrectPassword123!',
      });

      expect(result.accessToken).not.toBe(result.refreshToken);
    });

    it('should throw error for wrong password', async () => {
      await expect(
        userService.login({
          email: 'login@example.com',
          password: 'WrongPassword123!',
        })
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw error for non-existent email', async () => {
      await expect(
        userService.login({
          email: 'nonexistent@example.com',
          password: 'SomePassword123!',
        })
      ).rejects.toThrow('Invalid email or password');
    });

    it('should be case insensitive for email', async () => {
      const result = await userService.login({
        email: 'LOGIN@EXAMPLE.COM',
        password: 'CorrectPassword123!',
      });

      expect(result.user.email).toBe('login@example.com');
    });

    it('should update lastLoginAt on successful login', async () => {
      const before = Date.now();
      await userService.login({
        email: 'login@example.com',
        password: 'CorrectPassword123!',
      });
      const after = Date.now();

      const doc = testDb.users.findOne({ email: 'login@example.com' });
      expect(doc?.lastLoginAt).toBeGreaterThanOrEqual(before);
      expect(doc?.lastLoginAt).toBeLessThanOrEqual(after);
    });

    it('should throw error for disabled account', async () => {
      // Disable the user directly in DB
      const doc = testDb.users.findOne({ email: 'login@example.com' });
      if (doc) {
        doc.isActive = false;
        testDb.users.update(doc);
      }

      await expect(
        userService.login({
          email: 'login@example.com',
          password: 'CorrectPassword123!',
        })
      ).rejects.toThrow('Account is disabled');
    });
  });

  // ============================================================================
  // JWT Token Operations
  // ============================================================================

  describe('verifyToken', () => {
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      await userService.create({
        email: 'token@example.com',
        password: 'Password123!',
        name: 'Token User',
      });

      const result = await userService.login({
        email: 'token@example.com',
        password: 'Password123!',
      });

      accessToken = result.accessToken;
      refreshToken = result.refreshToken;
    });

    it('should verify valid access token', async () => {
      const payload = await userService.verifyToken(accessToken);

      expect(payload.email).toBe('token@example.com');
      expect(payload.type).toBe('access');
    });

    it('should verify valid refresh token', async () => {
      const payload = await userService.verifyToken(refreshToken);

      expect(payload.type).toBe('refresh');
    });

    it('should throw error for invalid token', async () => {
      await expect(userService.verifyToken('invalid-token')).rejects.toThrow(
        'Invalid or expired token'
      );
    });

    it('should throw error for malformed token', async () => {
      await expect(
        userService.verifyToken('not.a.valid.jwt.token.format')
      ).rejects.toThrow('Invalid or expired token');
    });
  });

  describe('refreshToken', () => {
    let refreshToken: string;
    let userId: string;

    beforeEach(async () => {
      const user = await userService.create({
        email: 'refresh@example.com',
        password: 'Password123!',
        name: 'Refresh User',
      });
      userId = user.id;

      const result = await userService.login({
        email: 'refresh@example.com',
        password: 'Password123!',
      });

      refreshToken = result.refreshToken;
    });

    it('should generate new access token from refresh token', async () => {
      const result = await userService.refreshToken(refreshToken);

      expect(result.accessToken).toBeDefined();
      expect(typeof result.accessToken).toBe('string');
    });

    it('should throw error when using access token as refresh token', async () => {
      const loginResult = await userService.login({
        email: 'refresh@example.com',
        password: 'Password123!',
      });

      await expect(
        userService.refreshToken(loginResult.accessToken)
      ).rejects.toThrow('Invalid refresh token');
    });

    it('should throw error for invalid refresh token', async () => {
      await expect(userService.refreshToken('invalid-token')).rejects.toThrow(
        'Invalid or expired token'
      );
    });
  });

  // ============================================================================
  // API Key Operations
  // ============================================================================

  describe('createApiKey', () => {
    let userId: string;

    beforeEach(async () => {
      const user = await userService.create({
        email: 'apikey@example.com',
        password: 'Password123!',
        name: 'API Key User',
      });
      userId = user.id;
    });

    it('should create API key for user', async () => {
      const result = await userService.createApiKey(userId, {
        name: 'Test API Key',
      });

      expect(result.key).toBeDefined();
      expect(typeof result.key).toBe('string');
      expect(result.apiKey.name).toBe('Test API Key');
      expect(result.apiKey.id).toBeDefined();
    });

    it('should create API key with expiration', async () => {
      const result = await userService.createApiKey(userId, {
        name: 'Expiring Key',
        expiresInDays: 30,
      });

      expect(result.apiKey.expiresAt).toBeDefined();
      const expectedExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
      expect(result.apiKey.expiresAt).toBeCloseTo(expectedExpiry, -3); // Within 1 second
    });

    it('should create API key with specific permissions', async () => {
      const result = await userService.createApiKey(userId, {
        name: 'Limited Key',
        permissions: ['entries:read', 'entries:create'],
      });

      expect(result.apiKey.permissions).toContain('entries:read');
      expect(result.apiKey.permissions).toContain('entries:create');
      expect(result.apiKey.permissions).toHaveLength(2);
    });

    it('should throw error for non-existent user', async () => {
      await expect(
        userService.createApiKey('nonexistent-id', { name: 'Test Key' })
      ).rejects.toThrow("User with id 'nonexistent-id' not found");
    });

    it('should store key hash, not actual key', async () => {
      const result = await userService.createApiKey(userId, {
        name: 'Hashed Key',
      });

      const doc = testDb.users.findOne({ id: userId });
      const storedKey = doc?.apiKeys.find((k: any) => k.id === result.apiKey.id);

      expect(storedKey?.keyHash).toBeDefined();
      expect(storedKey?.keyHash).not.toBe(result.key);
    });
  });

  describe('verifyApiKey', () => {
    let userId: string;
    let apiKey: string;

    beforeEach(async () => {
      const user = await userService.create({
        email: 'verify@example.com',
        password: 'Password123!',
        name: 'Verify User',
        role: 'editor',
      });
      userId = user.id;

      const result = await userService.createApiKey(userId, {
        name: 'Verify Key',
      });
      apiKey = result.key;
    });

    it('should verify valid API key', async () => {
      const session = await userService.verifyApiKey(apiKey);

      expect(session).not.toBeNull();
      expect(session?.user.id).toBe(userId);
    });

    it('should return null for invalid prefix', async () => {
      const session = await userService.verifyApiKey('invalid_prefix_key');

      expect(session).toBeNull();
    });

    it('should return null for non-existent key', async () => {
      // Create a valid-looking key that doesn't exist
      // Use the same prefix format as the service generates
      const fakeKey = `${process.env['API_KEY_PREFIX'] || 'test_'}nonexistent123456789`;
      const session = await userService.verifyApiKey(fakeKey);

      expect(session).toBeNull();
    });

    it('should return null for expired key', async () => {
      // Create key with short expiration, then manually expire it
      const result = await userService.createApiKey(userId, {
        name: 'Expired Key',
        expiresInDays: 1,
      });

      // Manually set expiration in the past
      const doc = testDb.users.findOne({ id: userId });
      if (doc) {
        const apiKey = doc.apiKeys.find((k: any) => k.id === result.apiKey.id);
        if (apiKey) {
          apiKey.expiresAt = Date.now() - 1000; // Already expired
          testDb.users.update(doc);
        }
      }

      const session = await userService.verifyApiKey(result.key);
      expect(session).toBeNull();
    });

    it('should update lastUsedAt on verification', async () => {
      const before = Date.now();
      await userService.verifyApiKey(apiKey);
      const after = Date.now();

      const doc = testDb.users.findOne({ id: userId });
      const storedKey = doc?.apiKeys[0];

      expect(storedKey?.lastUsedAt).toBeGreaterThanOrEqual(before);
      expect(storedKey?.lastUsedAt).toBeLessThanOrEqual(after);
    });

    it('should return user permissions if key has no specific permissions', async () => {
      const session = await userService.verifyApiKey(apiKey);

      expect(session?.permissions).toBeDefined();
      expect(Array.isArray(session?.permissions)).toBe(true);
    });

    it('should return key-specific permissions if defined', async () => {
      const result = await userService.createApiKey(userId, {
        name: 'Limited Key',
        permissions: ['entries:read'],
      });

      const session = await userService.verifyApiKey(result.key);

      expect(session?.permissions).toEqual(['entries:read']);
    });
  });

  describe('listApiKeys', () => {
    let userId: string;

    beforeEach(async () => {
      const user = await userService.create({
        email: 'list@example.com',
        password: 'Password123!',
        name: 'List User',
      });
      userId = user.id;

      await userService.createApiKey(userId, { name: 'Key 1' });
      await userService.createApiKey(userId, { name: 'Key 2' });
    });

    it('should list all API keys for user', async () => {
      const keys = await userService.listApiKeys(userId);

      expect(keys).toHaveLength(2);
      expect(keys.map(k => k.name)).toContain('Key 1');
      expect(keys.map(k => k.name)).toContain('Key 2');
    });

    it('should not expose key hash', async () => {
      const keys = await userService.listApiKeys(userId);

      keys.forEach(key => {
        expect(key).not.toHaveProperty('keyHash');
      });
    });

    it('should throw error for non-existent user', async () => {
      await expect(userService.listApiKeys('nonexistent-id')).rejects.toThrow(
        "User with id 'nonexistent-id' not found"
      );
    });
  });

  describe('revokeApiKey', () => {
    let userId: string;
    let apiKeyId: string;

    beforeEach(async () => {
      const user = await userService.create({
        email: 'revoke@example.com',
        password: 'Password123!',
        name: 'Revoke User',
      });
      userId = user.id;

      const result = await userService.createApiKey(userId, { name: 'To Revoke' });
      apiKeyId = result.apiKey.id;
    });

    it('should revoke API key', async () => {
      await userService.revokeApiKey(userId, apiKeyId);

      const keys = await userService.listApiKeys(userId);
      expect(keys).toHaveLength(0);
    });

    it('should throw error for non-existent user', async () => {
      await expect(
        userService.revokeApiKey('nonexistent-id', apiKeyId)
      ).rejects.toThrow("User with id 'nonexistent-id' not found");
    });

    it('should throw error for non-existent key', async () => {
      await expect(
        userService.revokeApiKey(userId, 'nonexistent-key-id')
      ).rejects.toThrow('API key not found');
    });
  });

  // ============================================================================
  // User Retrieval
  // ============================================================================

  describe('findAll', () => {
    beforeEach(async () => {
      await userService.create({
        email: 'user1@example.com',
        password: 'Password123!',
        name: 'User One',
      });
      await userService.create({
        email: 'user2@example.com',
        password: 'Password123!',
        name: 'User Two',
      });
    });

    it('should return all users', async () => {
      const users = await userService.findAll();

      expect(users).toHaveLength(2);
    });

    it('should not expose password hash', async () => {
      const users = await userService.findAll();

      users.forEach(user => {
        expect(user).not.toHaveProperty('passwordHash');
      });
    });
  });

  describe('findById', () => {
    let userId: string;

    beforeEach(async () => {
      const user = await userService.create({
        email: 'findbyid@example.com',
        password: 'Password123!',
        name: 'Find By ID',
      });
      userId = user.id;
    });

    it('should find user by ID', async () => {
      const user = await userService.findById(userId);

      expect(user).not.toBeNull();
      expect(user?.email).toBe('findbyid@example.com');
    });

    it('should return null for non-existent ID', async () => {
      const user = await userService.findById('nonexistent-id');

      expect(user).toBeNull();
    });
  });

  describe('findByEmail', () => {
    beforeEach(async () => {
      await userService.create({
        email: 'findbyemail@example.com',
        password: 'Password123!',
        name: 'Find By Email',
      });
    });

    it('should find user by email', async () => {
      const user = await userService.findByEmail('findbyemail@example.com');

      expect(user).not.toBeNull();
      expect(user?.name).toBe('Find By Email');
    });

    it('should be case insensitive', async () => {
      const user = await userService.findByEmail('FINDBYEMAIL@EXAMPLE.COM');

      expect(user).not.toBeNull();
    });

    it('should return null for non-existent email', async () => {
      const user = await userService.findByEmail('nonexistent@example.com');

      expect(user).toBeNull();
    });
  });

  // ============================================================================
  // User Update
  // ============================================================================

  describe('update', () => {
    let userId: string;

    beforeEach(async () => {
      const user = await userService.create({
        email: 'update@example.com',
        password: 'Password123!',
        name: 'Update User',
      });
      userId = user.id;
    });

    it('should update user name', async () => {
      const updated = await userService.update(userId, { name: 'New Name' });

      expect(updated.name).toBe('New Name');
    });

    it('should update user email', async () => {
      const updated = await userService.update(userId, {
        email: 'newemail@example.com',
      });

      expect(updated.email).toBe('newemail@example.com');
    });

    it('should normalize email to lowercase', async () => {
      const updated = await userService.update(userId, {
        email: 'NEWEMAIL@EXAMPLE.COM',
      });

      expect(updated.email).toBe('newemail@example.com');
    });

    it('should update user role', async () => {
      const updated = await userService.update(userId, { role: 'admin' });

      expect(updated.role).toBe('admin');
    });

    it('should throw error for non-existent user', async () => {
      await expect(
        userService.update('nonexistent-id', { name: 'New Name' })
      ).rejects.toThrow("User with id 'nonexistent-id' not found");
    });

    it('should throw error for duplicate email', async () => {
      await userService.create({
        email: 'existing@example.com',
        password: 'Password123!',
        name: 'Existing User',
      });

      await expect(
        userService.update(userId, { email: 'existing@example.com' })
      ).rejects.toThrow('Email already in use');
    });

    it('should update updatedAt timestamp', async () => {
      const before = Date.now();
      const updated = await userService.update(userId, { name: 'New Name' });
      const after = Date.now();

      expect(updated.updatedAt).toBeGreaterThanOrEqual(before);
      expect(updated.updatedAt).toBeLessThanOrEqual(after);
    });

    it('should update password when provided', async () => {
      await userService.update(userId, { password: 'NewPassword123!' });

      // Verify password was updated by checking the user doc
      const doc = testDb.users.findOne({ id: userId });
      expect(doc?.passwordHash).toBeDefined();
      // Password hash should be different format (salt:hash)
      expect(doc?.passwordHash).toContain(':');
    });
  });

  // ============================================================================
  // User Delete
  // ============================================================================

  describe('delete', () => {
    let userId: string;

    beforeEach(async () => {
      const user = await userService.create({
        email: 'delete@example.com',
        password: 'Password123!',
        name: 'Delete User',
      });
      userId = user.id;
    });

    it('should delete user', async () => {
      await userService.delete(userId);

      const user = await userService.findById(userId);
      expect(user).toBeNull();
    });

    it('should throw error for non-existent user', async () => {
      await expect(userService.delete('nonexistent-id')).rejects.toThrow(
        "User with id 'nonexistent-id' not found"
      );
    });
  });

  // ============================================================================
  // Password Change
  // ============================================================================

  describe('changePassword', () => {
    let userId: string;

    beforeEach(async () => {
      const user = await userService.create({
        email: 'changepass@example.com',
        password: 'OldPassword123!',
        name: 'Change Password User',
      });
      userId = user.id;
    });

    it('should change password with correct current password', async () => {
      await userService.changePassword(userId, 'OldPassword123!', 'NewPassword123!');

      // Should login with new password
      const result = await userService.login({
        email: 'changepass@example.com',
        password: 'NewPassword123!',
      });

      expect(result.user.id).toBe(userId);
    });

    it('should throw error with incorrect current password', async () => {
      await expect(
        userService.changePassword(userId, 'WrongPassword123!', 'NewPassword123!')
      ).rejects.toThrow('Current password is incorrect');
    });

    it('should throw error for non-existent user', async () => {
      await expect(
        userService.changePassword('nonexistent-id', 'Old123!', 'New123!')
      ).rejects.toThrow("User with id 'nonexistent-id' not found");
    });

    it('should not allow login with old password after change', async () => {
      await userService.changePassword(userId, 'OldPassword123!', 'NewPassword123!');

      await expect(
        userService.login({
          email: 'changepass@example.com',
          password: 'OldPassword123!',
        })
      ).rejects.toThrow('Invalid email or password');
    });
  });

  // ============================================================================
  // Session Info
  // ============================================================================

  describe('getSessionFromPayload', () => {
    let userId: string;

    beforeEach(async () => {
      const user = await userService.create({
        email: 'session@example.com',
        password: 'Password123!',
        name: 'Session User',
        role: 'editor',
      });
      userId = user.id;
    });

    it('should get session info from JWT payload', async () => {
      const loginResult = await userService.login({
        email: 'session@example.com',
        password: 'Password123!',
      });

      const payload = await userService.verifyToken(loginResult.accessToken);
      const session = await userService.getSessionFromPayload(payload);

      expect(session.user.id).toBe(userId);
      expect(session.permissions).toBeDefined();
    });

    it('should throw error for non-existent user in payload', async () => {
      const fakePayload = {
        sub: 'nonexistent-id',
        email: 'fake@example.com',
        name: 'Fake User',
        role: 'viewer' as const,
        type: 'access' as const,
      };

      await expect(userService.getSessionFromPayload(fakePayload)).rejects.toThrow(
        'User not found'
      );
    });
  });
});
