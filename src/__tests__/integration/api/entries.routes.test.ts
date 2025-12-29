/**
 * Entries Routes Tests
 * Tests for entry CRUD operations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { entryRoutes } from '../../../api/routes/entries.js';
import type { SessionInfo, Entry, PaginatedEntries } from '../../../models/index.js';

// Mock the services
vi.mock('../../../services/index.js', () => ({
  entryService: {
    findAll: vi.fn(),
    findById: vi.fn(),
    findBySlug: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    publish: vi.fn(),
    unpublish: vi.fn(),
    archive: vi.fn(),
    assignTerms: vi.fn(),
  },
  userService: {
    verifyToken: vi.fn(),
    getSessionFromPayload: vi.fn(),
    verifyApiKey: vi.fn(),
  },
}));

import { entryService, userService } from '../../../services/index.js';

describe('Entries Routes', () => {
  let app: Hono;

  const mockEntry: Entry = {
    id: 'entry-1',
    contentTypeId: 'ct-1',
    contentTypeSlug: 'blog-post',
    title: 'Test Entry',
    slug: 'test-entry',
    content: { title: 'Test Entry', body: 'Content here' },
    metadata: {},
    status: 'draft',
    authorId: 'user-1',
    authorName: 'Test User',
    taxonomyTerms: [],
    version: 1,
    locale: 'en',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const mockPaginatedEntries: PaginatedEntries = {
    entries: [mockEntry],
    total: 1,
    page: 1,
    limit: 20,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  };

  const createMockSession = (
    role: 'admin' | 'editor' | 'author' | 'viewer',
    permissions: string[],
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

  const setupAuth = (session: SessionInfo) => {
    vi.mocked(userService.verifyToken).mockResolvedValue({
      sub: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      type: 'access',
    });
    vi.mocked(userService.getSessionFromPayload).mockResolvedValue(session);
  };

  const setupNoAuth = () => {
    vi.mocked(userService.verifyToken).mockRejectedValue(new Error('Invalid token'));
  };

  beforeEach(() => {
    app = new Hono();
    app.route('/entries', entryRoutes);
    vi.clearAllMocks();
  });

  // ============================================================================
  // List Entries
  // ============================================================================

  describe('GET /entries', () => {
    it('should list entries for authenticated user', async () => {
      const session = createMockSession('editor', ['entries:read']);
      setupAuth(session);
      vi.mocked(entryService.findAll).mockResolvedValue(mockPaginatedEntries);

      const res = await app.request('/entries', {
        headers: { Authorization: 'Bearer valid-token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.entries).toHaveLength(1);
      expect(data.total).toBe(1);
    });

    it('should list only published entries for unauthenticated user', async () => {
      setupNoAuth();
      vi.mocked(entryService.findAll).mockResolvedValue(mockPaginatedEntries);

      const res = await app.request('/entries');

      expect(res.status).toBe(200);
      expect(entryService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'published' }),
        undefined,
        expect.anything()
      );
    });

    it('should filter by content type', async () => {
      setupNoAuth();
      vi.mocked(entryService.findAll).mockResolvedValue(mockPaginatedEntries);

      const res = await app.request('/entries?contentType=blog-post');

      expect(res.status).toBe(200);
      expect(entryService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ contentTypeSlug: 'blog-post' }),
        undefined,
        expect.anything()
      );
    });

    it('should support pagination', async () => {
      setupNoAuth();
      vi.mocked(entryService.findAll).mockResolvedValue({
        ...mockPaginatedEntries,
        page: 2,
        hasNext: false,
        hasPrev: true,
      });

      const res = await app.request('/entries?page=2&limit=10');

      expect(res.status).toBe(200);
      expect(entryService.findAll).toHaveBeenCalledWith(
        expect.anything(),
        undefined,
        expect.objectContaining({ page: 2, limit: 10 })
      );
    });

    it('should support sorting', async () => {
      setupNoAuth();
      vi.mocked(entryService.findAll).mockResolvedValue(mockPaginatedEntries);

      const res = await app.request('/entries?sortBy=title&sortOrder=asc');

      expect(res.status).toBe(200);
      expect(entryService.findAll).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ field: 'title', order: 'asc' }),
        expect.anything()
      );
    });

    it('should support search', async () => {
      setupNoAuth();
      vi.mocked(entryService.findAll).mockResolvedValue(mockPaginatedEntries);

      const res = await app.request('/entries?search=test');

      expect(res.status).toBe(200);
      expect(entryService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'test' }),
        undefined,
        expect.anything()
      );
    });

    it('should support term filter', async () => {
      setupNoAuth();
      vi.mocked(entryService.findAll).mockResolvedValue(mockPaginatedEntries);

      const res = await app.request('/entries?terms=term-1,term-2');

      expect(res.status).toBe(200);
      expect(entryService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ taxonomyTerms: ['term-1', 'term-2'] }),
        undefined,
        expect.anything()
      );
    });
  });

  // ============================================================================
  // Get Entry by ID
  // ============================================================================

  describe('GET /entries/id/:id', () => {
    it('should get published entry without auth', async () => {
      setupNoAuth();
      vi.mocked(entryService.findById).mockResolvedValue({
        ...mockEntry,
        status: 'published',
      });

      const res = await app.request('/entries/id/entry-1');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.entry.id).toBe('entry-1');
    });

    it('should return 404 for draft entry without auth', async () => {
      setupNoAuth();
      vi.mocked(entryService.findById).mockResolvedValue(mockEntry); // draft

      const res = await app.request('/entries/id/entry-1');

      expect(res.status).toBe(404);
    });

    it('should get draft entry with auth', async () => {
      const session = createMockSession('editor', ['entries:read']);
      setupAuth(session);
      vi.mocked(entryService.findById).mockResolvedValue(mockEntry);

      const res = await app.request('/entries/id/entry-1', {
        headers: { Authorization: 'Bearer valid-token' },
      });

      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent entry', async () => {
      setupNoAuth();
      vi.mocked(entryService.findById).mockResolvedValue(null);

      const res = await app.request('/entries/id/nonexistent');

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Entry not found');
    });
  });

  // ============================================================================
  // Get Entry by Slug
  // ============================================================================

  describe('GET /entries/:contentType/:slug', () => {
    it('should get published entry by slug', async () => {
      setupNoAuth();
      vi.mocked(entryService.findBySlug).mockResolvedValue({
        ...mockEntry,
        status: 'published',
      });

      const res = await app.request('/entries/blog-post/test-entry');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.entry.slug).toBe('test-entry');
    });

    it('should return 404 for non-existent slug', async () => {
      setupNoAuth();
      vi.mocked(entryService.findBySlug).mockResolvedValue(null);

      const res = await app.request('/entries/blog-post/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  // ============================================================================
  // Create Entry
  // ============================================================================

  describe('POST /entries', () => {
    it('should create entry with proper permissions', async () => {
      const session = createMockSession('editor', ['entries:write']);
      setupAuth(session);
      vi.mocked(entryService.create).mockResolvedValue(mockEntry);

      const res = await app.request('/entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          contentTypeId: 'ct-1',
          title: 'New Entry',
          content: { title: 'New Entry' },
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.entry).toBeDefined();
    });

    it('should return 401 without auth', async () => {
      setupNoAuth();

      const res = await app.request('/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentTypeId: 'ct-1',
          title: 'New Entry',
          content: {},
        }),
      });

      expect(res.status).toBe(401);
    });

    it('should return 403 without write permission', async () => {
      const session = createMockSession('viewer', ['entries:read']); // No write
      setupAuth(session);

      const res = await app.request('/entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          contentTypeId: 'ct-1',
          title: 'New Entry',
          content: {},
        }),
      });

      expect(res.status).toBe(403);
    });

    it('should return 400 for invalid input', async () => {
      const session = createMockSession('editor', ['entries:write']);
      setupAuth(session);

      const res = await app.request('/entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          // Missing required fields
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  // ============================================================================
  // Update Entry
  // ============================================================================

  describe('PUT /entries/id/:id', () => {
    it('should update own entry', async () => {
      const session = createMockSession('author', ['entries:write:own'], 'user-1');
      setupAuth(session);
      vi.mocked(entryService.findById).mockResolvedValue(mockEntry); // authorId: user-1
      vi.mocked(entryService.update).mockResolvedValue({
        ...mockEntry,
        title: 'Updated Title',
      });

      const res = await app.request('/entries/id/entry-1', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({ title: 'Updated Title' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.entry.title).toBe('Updated Title');
    });

    it('should not allow updating others entry without full permission', async () => {
      const session = createMockSession('author', ['entries:write:own'], 'user-2'); // Different user
      setupAuth(session);
      vi.mocked(entryService.findById).mockResolvedValue(mockEntry); // authorId: user-1

      const res = await app.request('/entries/id/entry-1', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({ title: 'Updated Title' }),
      });

      expect(res.status).toBe(403);
    });

    it('should allow updating others entry with full permission', async () => {
      const session = createMockSession('editor', ['entries:write'], 'user-2');
      setupAuth(session);
      vi.mocked(entryService.findById).mockResolvedValue(mockEntry);
      vi.mocked(entryService.update).mockResolvedValue({
        ...mockEntry,
        title: 'Updated',
      });

      const res = await app.request('/entries/id/entry-1', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({ title: 'Updated' }),
      });

      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent entry', async () => {
      const session = createMockSession('editor', ['entries:write']);
      setupAuth(session);
      vi.mocked(entryService.findById).mockResolvedValue(null);

      const res = await app.request('/entries/id/nonexistent', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({ title: 'Updated' }),
      });

      expect(res.status).toBe(404);
    });
  });

  // ============================================================================
  // Delete Entry
  // ============================================================================

  describe('DELETE /entries/id/:id', () => {
    it('should delete own entry', async () => {
      const session = createMockSession('author', ['entries:delete:own'], 'user-1');
      setupAuth(session);
      vi.mocked(entryService.findById).mockResolvedValue(mockEntry);
      vi.mocked(entryService.delete).mockResolvedValue();

      const res = await app.request('/entries/id/entry-1', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer valid-token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toBe('Entry deleted');
    });

    it('should not allow deleting others entry without full permission', async () => {
      const session = createMockSession('author', ['entries:delete:own'], 'user-2');
      setupAuth(session);
      vi.mocked(entryService.findById).mockResolvedValue(mockEntry);

      const res = await app.request('/entries/id/entry-1', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer valid-token' },
      });

      expect(res.status).toBe(403);
    });

    it('should return 404 for non-existent entry', async () => {
      const session = createMockSession('editor', ['entries:delete']);
      setupAuth(session);
      vi.mocked(entryService.findById).mockResolvedValue(null);

      const res = await app.request('/entries/id/nonexistent', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer valid-token' },
      });

      expect(res.status).toBe(404);
    });
  });

  // ============================================================================
  // Publish/Unpublish/Archive
  // ============================================================================

  describe('POST /entries/id/:id/publish', () => {
    it('should publish entry with permission', async () => {
      const session = createMockSession('editor', ['entries:publish']);
      setupAuth(session);
      vi.mocked(entryService.findById).mockResolvedValue(mockEntry);
      vi.mocked(entryService.publish).mockResolvedValue({
        ...mockEntry,
        status: 'published',
      });

      const res = await app.request('/entries/id/entry-1/publish', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.entry.status).toBe('published');
    });

    it('should return 403 without publish permission', async () => {
      const session = createMockSession('author', ['entries:write']); // No publish
      setupAuth(session);
      vi.mocked(entryService.findById).mockResolvedValue(mockEntry);

      const res = await app.request('/entries/id/entry-1/publish', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-token' },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /entries/id/:id/unpublish', () => {
    it('should unpublish entry with permission', async () => {
      const session = createMockSession('editor', ['entries:publish']);
      setupAuth(session);
      vi.mocked(entryService.findById).mockResolvedValue({
        ...mockEntry,
        status: 'published',
      });
      vi.mocked(entryService.unpublish).mockResolvedValue({
        ...mockEntry,
        status: 'draft',
      });

      const res = await app.request('/entries/id/entry-1/unpublish', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.entry.status).toBe('draft');
    });
  });

  describe('POST /entries/id/:id/archive', () => {
    it('should archive entry with permission', async () => {
      const session = createMockSession('editor', ['entries:write']);
      setupAuth(session);
      vi.mocked(entryService.findById).mockResolvedValue(mockEntry);
      vi.mocked(entryService.archive).mockResolvedValue({
        ...mockEntry,
        status: 'archived',
      });

      const res = await app.request('/entries/id/entry-1/archive', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.entry.status).toBe('archived');
    });
  });

  // ============================================================================
  // Assign Terms
  // ============================================================================

  describe('POST /entries/id/:id/terms', () => {
    it('should assign terms to entry', async () => {
      const session = createMockSession('editor', ['entries:write']);
      setupAuth(session);
      vi.mocked(entryService.findById).mockResolvedValue(mockEntry);
      vi.mocked(entryService.assignTerms).mockResolvedValue({
        ...mockEntry,
        taxonomyTerms: ['term-1', 'term-2'],
      });

      const res = await app.request('/entries/id/entry-1/terms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({ termIds: ['term-1', 'term-2'] }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.entry.taxonomyTerms).toContain('term-1');
    });

    it('should return 404 for non-existent entry', async () => {
      const session = createMockSession('editor', ['entries:write']);
      setupAuth(session);
      vi.mocked(entryService.findById).mockResolvedValue(null);

      const res = await app.request('/entries/id/nonexistent/terms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({ termIds: ['term-1'] }),
      });

      expect(res.status).toBe(404);
    });
  });
});
