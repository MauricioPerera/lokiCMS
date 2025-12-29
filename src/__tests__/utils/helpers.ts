/**
 * Test Helpers
 * Common utilities for API and integration tests
 */

import { Hono } from 'hono';
import type { SessionInfo, SafeUser, UserRole } from '../../models/index.js';
import { ROLE_PERMISSIONS } from '../../models/index.js';
import { nanoid } from 'nanoid';

/**
 * Create a test Hono app
 */
export function createTestApp(): Hono {
  return new Hono();
}

/**
 * Make a test HTTP request
 */
export async function testRequest(
  app: Hono,
  method: string,
  path: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Promise<Response> {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  return app.fetch(req);
}

/**
 * Parse JSON response
 */
export async function parseJsonResponse<T = unknown>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

/**
 * Create authenticated request headers
 */
export function createAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Create API key request headers
 */
export function createApiKeyHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `ApiKey ${apiKey}`,
  };
}

/**
 * Create a mock session info
 */
export function createMockSession(
  role: UserRole = 'viewer',
  overrides: Partial<SessionInfo> = {}
): SessionInfo {
  const now = Date.now();
  const user: SafeUser = {
    id: nanoid(),
    email: `test-${nanoid(8)}@example.com`,
    name: `Test User`,
    role,
    isActive: true,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  };

  return {
    user,
    permissions: ROLE_PERMISSIONS[role] || [],
    ...overrides,
  };
}

/**
 * Create admin session
 */
export function createAdminSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return createMockSession('admin', overrides);
}

/**
 * Create editor session
 */
export function createEditorSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return createMockSession('editor', overrides);
}

/**
 * Create author session
 */
export function createAuthorSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return createMockSession('author', overrides);
}

/**
 * Create viewer session
 */
export function createViewerSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return createMockSession('viewer', overrides);
}

/**
 * Wait for async operation with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate random string
 */
export function randomString(length: number = 10): string {
  return nanoid(length);
}

/**
 * Generate random email
 */
export function randomEmail(): string {
  return `test-${nanoid(8)}@example.com`;
}

/**
 * Generate timestamp in the past
 */
export function pastTimestamp(daysAgo: number): number {
  return Date.now() - daysAgo * 24 * 60 * 60 * 1000;
}

/**
 * Generate timestamp in the future
 */
export function futureTimestamp(daysAhead: number): number {
  return Date.now() + daysAhead * 24 * 60 * 60 * 1000;
}

/**
 * Assert response status
 */
export function assertStatus(response: Response, expectedStatus: number): void {
  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus}, got ${response.status}`
    );
  }
}

/**
 * Assert response is JSON
 */
export function assertJsonContentType(response: Response): void {
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    throw new Error(
      `Expected JSON content type, got ${contentType}`
    );
  }
}

/**
 * Create a mock context with session
 */
export function createMockContext(session?: SessionInfo): {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
} {
  const store = new Map<string, unknown>();
  if (session) {
    store.set('session', session);
  }

  return {
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => store.set(key, value),
  };
}
