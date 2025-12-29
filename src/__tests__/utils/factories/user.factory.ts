/**
 * User Factory
 * Generate test user data
 */

import { nanoid } from 'nanoid';
import type { User, CreateUserInput, SafeUser, UserRole, ApiKey } from '../../../models/index.js';

let userCounter = 0;

/**
 * Generate unique email for tests
 */
export function uniqueEmail(): string {
  return `test-${nanoid(8)}@example.com`;
}

/**
 * Create user input for registration/creation
 */
export function createUserInput(overrides: Partial<CreateUserInput> = {}): CreateUserInput {
  userCounter++;
  return {
    email: uniqueEmail(),
    password: 'TestPassword123!',
    name: `Test User ${userCounter}`,
    role: 'viewer',
    ...overrides,
  };
}

/**
 * Create a full user document (as stored in DB)
 */
export function createUser(overrides: Partial<User> = {}): User {
  const now = Date.now();
  userCounter++;
  return {
    id: nanoid(),
    email: uniqueEmail(),
    passwordHash: 'fake-hash-for-testing',
    name: `Test User ${userCounter}`,
    role: 'viewer',
    apiKeys: [],
    isActive: true,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create admin user
 */
export function createAdminUser(overrides: Partial<User> = {}): User {
  return createUser({ role: 'admin', ...overrides });
}

/**
 * Create editor user
 */
export function createEditorUser(overrides: Partial<User> = {}): User {
  return createUser({ role: 'editor', ...overrides });
}

/**
 * Create author user
 */
export function createAuthorUser(overrides: Partial<User> = {}): User {
  return createUser({ role: 'author', ...overrides });
}

/**
 * Create viewer user
 */
export function createViewerUser(overrides: Partial<User> = {}): User {
  return createUser({ role: 'viewer', ...overrides });
}

/**
 * Create user with specific role
 */
export function createUserWithRole(role: UserRole, overrides: Partial<User> = {}): User {
  return createUser({ role, ...overrides });
}

/**
 * Create safe user (without sensitive data)
 */
export function createSafeUser(overrides: Partial<SafeUser> = {}): SafeUser {
  const now = Date.now();
  userCounter++;
  return {
    id: nanoid(),
    email: uniqueEmail(),
    name: `Test User ${userCounter}`,
    role: 'viewer',
    isActive: true,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create API key
 */
export function createApiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  const now = Date.now();
  return {
    id: nanoid(),
    name: `Test API Key ${nanoid(4)}`,
    keyHash: 'fake-key-hash',
    keyPrefix: 'test_',
    permissions: [],
    createdAt: now,
    ...overrides,
  };
}

/**
 * Create user with API keys
 */
export function createUserWithApiKeys(
  apiKeyCount: number = 1,
  userOverrides: Partial<User> = {}
): User {
  const apiKeys = Array.from({ length: apiKeyCount }, () => createApiKey());
  return createUser({ apiKeys, ...userOverrides });
}

/**
 * Reset user counter (for test isolation)
 */
export function resetUserCounter(): void {
  userCounter = 0;
}
