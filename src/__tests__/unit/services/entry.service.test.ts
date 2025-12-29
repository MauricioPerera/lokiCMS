/**
 * EntryService Tests
 * Tests for entry management, filtering, and pagination
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../../utils/test-db.js';
import { createEntry, createPublishedEntry, createDraftEntry } from '../../utils/factories/entry.factory.js';
import { createContentType, commonFields } from '../../utils/factories/content-type.factory.js';
import { createTerm } from '../../utils/factories/term.factory.js';

// Mock the database and plugins modules
vi.mock('../../../db/index.js', () => ({
  getEntriesCollection: vi.fn(),
  getContentTypesCollection: vi.fn(),
  getTermsCollection: vi.fn(),
}));

vi.mock('../../../plugins/index.js', () => ({
  hookSystem: {
    execute: vi.fn().mockImplementation((_event, payload) => Promise.resolve(payload)),
  },
}));

import {
  getEntriesCollection,
  getContentTypesCollection,
  getTermsCollection,
} from '../../../db/index.js';
import { EntryService } from '../../../services/entry.service.js';

describe('EntryService', () => {
  let testDb: TestDatabase;
  let entryService: EntryService;
  let contentTypeId: string;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    vi.mocked(getEntriesCollection).mockReturnValue(testDb.entries as any);
    vi.mocked(getContentTypesCollection).mockReturnValue(testDb.contentTypes as any);
    vi.mocked(getTermsCollection).mockReturnValue(testDb.terms as any);
    entryService = new EntryService();

    // Create a default content type for tests
    const ct = createContentType({
      name: 'Blog Post',
      slug: 'blog-post',
      fields: [commonFields.title(), commonFields.body()],
    });
    testDb.contentTypes.insert(ct);
    contentTypeId = ct.id;
  });

  afterEach(async () => {
    await testDb.cleanup();
    vi.clearAllMocks();
  });

  // ============================================================================
  // Entry Creation
  // ============================================================================

  describe('create', () => {
    it('should create an entry with valid input', async () => {
      const entry = await entryService.create(
        {
          contentTypeId,
          title: 'My First Post',
          content: { title: 'My First Post', body: 'Hello World' },
        },
        'author-1',
        'John Doe'
      );

      expect(entry.title).toBe('My First Post');
      expect(entry.authorId).toBe('author-1');
      expect(entry.authorName).toBe('John Doe');
      expect(entry.status).toBe('draft'); // default status
    });

    it('should generate slug from title', async () => {
      const entry = await entryService.create(
        {
          contentTypeId,
          title: 'Hello World Post',
          content: { title: 'Hello World Post', body: 'Content here' },
        },
        'author-1'
      );

      expect(entry.slug).toBe('hello-world-post');
    });

    it('should use provided slug', async () => {
      const entry = await entryService.create(
        {
          contentTypeId,
          title: 'My Post',
          slug: 'custom-slug',
          content: { title: 'My Post', body: 'Content' },
        },
        'author-1'
      );

      expect(entry.slug).toBe('custom-slug');
    });

    it('should resolve content type by slug', async () => {
      const entry = await entryService.create(
        {
          contentTypeSlug: 'blog-post',
          title: 'By Slug',
          content: { title: 'By Slug', body: 'Content' },
        },
        'author-1'
      );

      expect(entry.contentTypeId).toBe(contentTypeId);
      expect(entry.contentTypeSlug).toBe('blog-post');
    });

    it('should throw error for non-existent content type', async () => {
      await expect(
        entryService.create(
          {
            contentTypeId: 'nonexistent-id',
            title: 'Test',
            content: {},
          },
          'author-1'
        )
      ).rejects.toThrow('Content type not found');
    });

    it('should throw error for duplicate slug in same content type', async () => {
      await entryService.create(
        {
          contentTypeId,
          title: 'First',
          slug: 'my-slug',
          content: { title: 'First', body: 'Content' },
        },
        'author-1'
      );

      await expect(
        entryService.create(
          {
            contentTypeId,
            title: 'Second',
            slug: 'my-slug',
            content: { title: 'Second', body: 'Content' },
          },
          'author-1'
        )
      ).rejects.toThrow("Entry with slug 'my-slug' already exists in this content type");
    });

    it('should allow same slug in different content types', async () => {
      const ct2 = createContentType({ name: 'Page', slug: 'page' });
      testDb.contentTypes.insert(ct2);

      await entryService.create(
        {
          contentTypeId,
          title: 'Entry',
          slug: 'same-slug',
          content: { title: 'Entry', body: 'Content' },
        },
        'author-1'
      );

      const entry2 = await entryService.create(
        {
          contentTypeId: ct2.id,
          title: 'Entry 2',
          slug: 'same-slug',
          content: { title: 'Entry 2', body: 'Content' },
        },
        'author-1'
      );

      expect(entry2.slug).toBe('same-slug');
    });

    it('should create entry with published status', async () => {
      const entry = await entryService.create(
        {
          contentTypeId,
          title: 'Published',
          content: { title: 'Published', body: 'Content' },
          status: 'published',
        },
        'author-1'
      );

      expect(entry.status).toBe('published');
      expect(entry.publishedAt).toBeDefined();
    });

    it('should set timestamps', async () => {
      const before = Date.now();
      const entry = await entryService.create(
        {
          contentTypeId,
          title: 'Test',
          content: { title: 'Test', body: 'Content' },
        },
        'author-1'
      );
      const after = Date.now();

      expect(entry.createdAt).toBeGreaterThanOrEqual(before);
      expect(entry.createdAt).toBeLessThanOrEqual(after);
      expect(entry.version).toBe(1);
    });

    it('should validate taxonomy terms exist', async () => {
      await expect(
        entryService.create(
          {
            contentTypeId,
            title: 'Test',
            content: { title: 'Test', body: 'Content' },
            taxonomyTerms: ['nonexistent-term'],
          },
          'author-1'
        )
      ).rejects.toThrow("Term with id 'nonexistent-term' not found");
    });

    it('should create entry with taxonomy terms', async () => {
      const term = createTerm({ taxonomyId: 'tax-1', taxonomySlug: 'categories' });
      testDb.terms.insert(term);

      const entry = await entryService.create(
        {
          contentTypeId,
          title: 'Tagged',
          content: { title: 'Tagged', body: 'Content' },
          taxonomyTerms: [term.id],
        },
        'author-1'
      );

      expect(entry.taxonomyTerms).toContain(term.id);
    });

    it('should increment term count on creation', async () => {
      const term = createTerm({ taxonomyId: 'tax-1', taxonomySlug: 'categories', count: 0 });
      testDb.terms.insert(term);

      await entryService.create(
        {
          contentTypeId,
          title: 'Tagged',
          content: { title: 'Tagged', body: 'Content' },
          taxonomyTerms: [term.id],
        },
        'author-1'
      );

      const updatedTerm = testDb.terms.findOne({ id: term.id });
      expect(updatedTerm?.count).toBe(1);
    });

    it('should set default locale', async () => {
      const entry = await entryService.create(
        {
          contentTypeId,
          title: 'Test',
          content: { title: 'Test', body: 'Content' },
        },
        'author-1'
      );

      expect(entry.locale).toBe('en');
    });

    it('should set specified locale', async () => {
      const entry = await entryService.create(
        {
          contentTypeId,
          title: 'Test',
          content: { title: 'Test', body: 'Content' },
          locale: 'es',
        },
        'author-1'
      );

      expect(entry.locale).toBe('es');
    });
  });

  // ============================================================================
  // Entry Retrieval
  // ============================================================================

  describe('findAll', () => {
    beforeEach(async () => {
      const entries = [
        createEntry({ contentTypeId, contentTypeSlug: 'blog-post', title: 'Entry 1', status: 'published', authorId: 'author-1' }),
        createEntry({ contentTypeId, contentTypeSlug: 'blog-post', title: 'Entry 2', status: 'draft', authorId: 'author-1' }),
        createEntry({ contentTypeId, contentTypeSlug: 'blog-post', title: 'Entry 3', status: 'published', authorId: 'author-2' }),
      ];
      entries.forEach(e => testDb.entries.insert(e));
    });

    it('should return all entries', async () => {
      const result = await entryService.findAll();

      expect(result.entries).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('should return pagination info', async () => {
      const result = await entryService.findAll();

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
      expect(result.hasNext).toBe(false);
      expect(result.hasPrev).toBe(false);
    });

    it('should filter by contentTypeId', async () => {
      const ct2 = createContentType({ name: 'Page', slug: 'page' });
      testDb.contentTypes.insert(ct2);
      testDb.entries.insert(createEntry({ contentTypeId: ct2.id, contentTypeSlug: 'page' }));

      const result = await entryService.findAll({ contentTypeId });

      expect(result.entries).toHaveLength(3);
      expect(result.entries.every(e => e.contentTypeId === contentTypeId)).toBe(true);
    });

    it('should filter by contentTypeSlug', async () => {
      const result = await entryService.findAll({ contentTypeSlug: 'blog-post' });

      expect(result.entries).toHaveLength(3);
    });

    it('should filter by status', async () => {
      const result = await entryService.findAll({ status: 'published' });

      expect(result.entries).toHaveLength(2);
      expect(result.entries.every(e => e.status === 'published')).toBe(true);
    });

    it('should filter by authorId', async () => {
      const result = await entryService.findAll({ authorId: 'author-1' });

      expect(result.entries).toHaveLength(2);
    });

    it('should filter by search term', async () => {
      const result = await entryService.findAll({ search: 'Entry 1' });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]?.title).toBe('Entry 1');
    });

    it('should search in title and slug', async () => {
      testDb.entries.insert(
        createEntry({ contentTypeId, contentTypeSlug: 'blog-post', title: 'Other', slug: 'entry-4' })
      );

      const result = await entryService.findAll({ search: 'entry' });

      expect(result.entries.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('findAll - sorting', () => {
    beforeEach(async () => {
      const now = Date.now();
      const entries = [
        createEntry({ contentTypeId, contentTypeSlug: 'blog-post', title: 'B Entry', createdAt: now - 2000 }),
        createEntry({ contentTypeId, contentTypeSlug: 'blog-post', title: 'A Entry', createdAt: now - 1000 }),
        createEntry({ contentTypeId, contentTypeSlug: 'blog-post', title: 'C Entry', createdAt: now }),
      ];
      entries.forEach(e => testDb.entries.insert(e));
    });

    it('should sort by createdAt desc by default', async () => {
      const result = await entryService.findAll();

      expect(result.entries[0]?.title).toBe('C Entry');
      expect(result.entries[2]?.title).toBe('B Entry');
    });

    it('should sort by specified field', async () => {
      const result = await entryService.findAll(undefined, { field: 'title', order: 'asc' });

      expect(result.entries[0]?.title).toBe('A Entry');
      expect(result.entries[2]?.title).toBe('C Entry');
    });

    it('should sort descending', async () => {
      const result = await entryService.findAll(undefined, { field: 'title', order: 'desc' });

      expect(result.entries[0]?.title).toBe('C Entry');
      expect(result.entries[2]?.title).toBe('A Entry');
    });
  });

  describe('findAll - pagination', () => {
    beforeEach(async () => {
      // Create 25 entries
      for (let i = 1; i <= 25; i++) {
        testDb.entries.insert(
          createEntry({
            contentTypeId,
            contentTypeSlug: 'blog-post',
            title: `Entry ${i.toString().padStart(2, '0')}`,
          })
        );
      }
    });

    it('should paginate results', async () => {
      const result = await entryService.findAll(undefined, undefined, { page: 1, limit: 10 });

      expect(result.entries).toHaveLength(10);
      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(3);
      expect(result.hasNext).toBe(true);
      expect(result.hasPrev).toBe(false);
    });

    it('should return second page', async () => {
      const result = await entryService.findAll(undefined, undefined, { page: 2, limit: 10 });

      expect(result.entries).toHaveLength(10);
      expect(result.page).toBe(2);
      expect(result.hasNext).toBe(true);
      expect(result.hasPrev).toBe(true);
    });

    it('should return last page with fewer items', async () => {
      const result = await entryService.findAll(undefined, undefined, { page: 3, limit: 10 });

      expect(result.entries).toHaveLength(5);
      expect(result.hasNext).toBe(false);
      expect(result.hasPrev).toBe(true);
    });
  });

  describe('findAll - date filters', () => {
    beforeEach(async () => {
      const now = Date.now();
      const entries = [
        createEntry({
          contentTypeId,
          contentTypeSlug: 'blog-post',
          title: 'Old',
          createdAt: now - 7 * 24 * 60 * 60 * 1000, // 7 days ago
        }),
        createEntry({
          contentTypeId,
          contentTypeSlug: 'blog-post',
          title: 'Recent',
          createdAt: now - 1 * 24 * 60 * 60 * 1000, // 1 day ago
        }),
        createEntry({
          contentTypeId,
          contentTypeSlug: 'blog-post',
          title: 'Today',
          createdAt: now,
        }),
      ];
      entries.forEach(e => testDb.entries.insert(e));
    });

    it('should filter by createdAfter', async () => {
      const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
      const result = await entryService.findAll({ createdAfter: threeDaysAgo });

      expect(result.entries).toHaveLength(2);
    });

    it('should filter by createdBefore', async () => {
      const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
      const result = await entryService.findAll({ createdBefore: threeDaysAgo });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]?.title).toBe('Old');
    });
  });

  describe('findAll - taxonomy filter', () => {
    beforeEach(async () => {
      const term1 = createTerm({ id: 'term-1', taxonomyId: 'tax-1', taxonomySlug: 'categories' });
      const term2 = createTerm({ id: 'term-2', taxonomyId: 'tax-1', taxonomySlug: 'categories' });
      testDb.terms.insert(term1);
      testDb.terms.insert(term2);

      testDb.entries.insert(
        createEntry({
          contentTypeId,
          contentTypeSlug: 'blog-post',
          title: 'Tagged 1',
          taxonomyTerms: ['term-1'],
        })
      );
      testDb.entries.insert(
        createEntry({
          contentTypeId,
          contentTypeSlug: 'blog-post',
          title: 'Tagged 2',
          taxonomyTerms: ['term-2'],
        })
      );
      testDb.entries.insert(
        createEntry({
          contentTypeId,
          contentTypeSlug: 'blog-post',
          title: 'Tagged Both',
          taxonomyTerms: ['term-1', 'term-2'],
        })
      );
      testDb.entries.insert(
        createEntry({
          contentTypeId,
          contentTypeSlug: 'blog-post',
          title: 'Untagged',
          taxonomyTerms: [],
        })
      );
    });

    it('should filter by single taxonomy term', async () => {
      const result = await entryService.findAll({ taxonomyTerms: ['term-1'] });

      expect(result.entries).toHaveLength(2);
    });

    it('should filter by multiple taxonomy terms (OR)', async () => {
      const result = await entryService.findAll({ taxonomyTerms: ['term-1', 'term-2'] });

      expect(result.entries).toHaveLength(3);
    });
  });

  describe('findById', () => {
    it('should find entry by ID', async () => {
      const created = createEntry({
        contentTypeId,
        contentTypeSlug: 'blog-post',
        title: 'Find Me',
      });
      testDb.entries.insert(created);

      const entry = await entryService.findById(created.id);

      expect(entry).not.toBeNull();
      expect(entry?.title).toBe('Find Me');
    });

    it('should return null for non-existent ID', async () => {
      const entry = await entryService.findById('nonexistent-id');

      expect(entry).toBeNull();
    });
  });

  describe('findBySlug', () => {
    it('should find entry by slug and content type', async () => {
      testDb.entries.insert(
        createEntry({
          contentTypeId,
          contentTypeSlug: 'blog-post',
          title: 'My Post',
          slug: 'my-post',
        })
      );

      const entry = await entryService.findBySlug('my-post', 'blog-post');

      expect(entry).not.toBeNull();
      expect(entry?.title).toBe('My Post');
    });

    it('should return null for non-existent slug', async () => {
      const entry = await entryService.findBySlug('nonexistent', 'blog-post');

      expect(entry).toBeNull();
    });
  });

  // ============================================================================
  // Entry Update
  // ============================================================================

  describe('update', () => {
    let entryId: string;

    beforeEach(async () => {
      const entry = createEntry({
        contentTypeId,
        contentTypeSlug: 'blog-post',
        title: 'Original Title',
        content: { title: 'Original Title', body: 'Original body' },
      });
      testDb.entries.insert(entry);
      entryId = entry.id;
    });

    it('should update entry title', async () => {
      const updated = await entryService.update(entryId, { title: 'New Title' });

      expect(updated.title).toBe('New Title');
    });

    it('should update entry slug', async () => {
      const updated = await entryService.update(entryId, { slug: 'new-slug' });

      expect(updated.slug).toBe('new-slug');
    });

    it('should merge content updates', async () => {
      const updated = await entryService.update(entryId, {
        content: { body: 'Updated body' },
      });

      expect(updated.content.title).toBe('Original Title');
      expect(updated.content.body).toBe('Updated body');
    });

    it('should increment version on update', async () => {
      const updated = await entryService.update(entryId, { title: 'New' });

      expect(updated.version).toBe(2);
    });

    it('should update updatedAt timestamp', async () => {
      const before = Date.now();
      const updated = await entryService.update(entryId, { title: 'New' });
      const after = Date.now();

      expect(updated.updatedAt).toBeGreaterThanOrEqual(before);
      expect(updated.updatedAt).toBeLessThanOrEqual(after);
    });

    it('should throw error for non-existent entry', async () => {
      await expect(
        entryService.update('nonexistent-id', { title: 'New' })
      ).rejects.toThrow("Entry with id 'nonexistent-id' not found");
    });

    it('should throw error for duplicate slug', async () => {
      testDb.entries.insert(
        createEntry({
          contentTypeId,
          contentTypeSlug: 'blog-post',
          slug: 'existing-slug',
        })
      );

      await expect(
        entryService.update(entryId, { slug: 'existing-slug' })
      ).rejects.toThrow("Entry with slug 'existing-slug' already exists");
    });

    it('should set publishedAt when publishing', async () => {
      const doc = testDb.entries.findOne({ id: entryId });
      if (doc) {
        doc.status = 'draft';
        doc.publishedAt = undefined;
        testDb.entries.update(doc);
      }

      const updated = await entryService.update(entryId, { status: 'published' });

      expect(updated.publishedAt).toBeDefined();
    });

    it('should update taxonomy terms', async () => {
      const term = createTerm({ id: 'new-term', taxonomyId: 'tax-1', taxonomySlug: 'cat' });
      testDb.terms.insert(term);

      const updated = await entryService.update(entryId, {
        taxonomyTerms: ['new-term'],
      });

      expect(updated.taxonomyTerms).toContain('new-term');
    });
  });

  // ============================================================================
  // Entry Delete
  // ============================================================================

  describe('delete', () => {
    let entryId: string;

    beforeEach(async () => {
      const term = createTerm({ id: 'term-1', taxonomyId: 'tax-1', taxonomySlug: 'cat', count: 1 });
      testDb.terms.insert(term);

      const entry = createEntry({
        contentTypeId,
        contentTypeSlug: 'blog-post',
        taxonomyTerms: ['term-1'],
      });
      testDb.entries.insert(entry);
      entryId = entry.id;
    });

    it('should delete entry', async () => {
      await entryService.delete(entryId);

      const entry = await entryService.findById(entryId);
      expect(entry).toBeNull();
    });

    it('should throw error for non-existent entry', async () => {
      await expect(entryService.delete('nonexistent-id')).rejects.toThrow(
        "Entry with id 'nonexistent-id' not found"
      );
    });

    it('should decrement term count on deletion', async () => {
      await entryService.delete(entryId);

      const term = testDb.terms.findOne({ id: 'term-1' });
      expect(term?.count).toBe(0);
    });
  });

  // ============================================================================
  // Entry Status Operations
  // ============================================================================

  describe('publish', () => {
    let entryId: string;

    beforeEach(async () => {
      const entry = createEntry({
        contentTypeId,
        contentTypeSlug: 'blog-post',
        status: 'draft',
      });
      testDb.entries.insert(entry);
      entryId = entry.id;
    });

    it('should publish entry', async () => {
      const published = await entryService.publish(entryId);

      expect(published.status).toBe('published');
      expect(published.publishedAt).toBeDefined();
    });

    it('should throw error for non-existent entry', async () => {
      await expect(entryService.publish('nonexistent-id')).rejects.toThrow(
        "Entry with id 'nonexistent-id' not found"
      );
    });
  });

  describe('unpublish', () => {
    let entryId: string;

    beforeEach(async () => {
      const entry = createEntry({
        contentTypeId,
        contentTypeSlug: 'blog-post',
        status: 'published',
        publishedAt: Date.now(),
      });
      testDb.entries.insert(entry);
      entryId = entry.id;
    });

    it('should unpublish entry', async () => {
      const unpublished = await entryService.unpublish(entryId);

      expect(unpublished.status).toBe('draft');
    });

    it('should throw error for non-existent entry', async () => {
      await expect(entryService.unpublish('nonexistent-id')).rejects.toThrow(
        "Entry with id 'nonexistent-id' not found"
      );
    });
  });

  describe('archive', () => {
    let entryId: string;

    beforeEach(async () => {
      const entry = createEntry({
        contentTypeId,
        contentTypeSlug: 'blog-post',
        status: 'published',
      });
      testDb.entries.insert(entry);
      entryId = entry.id;
    });

    it('should archive entry', async () => {
      const archived = await entryService.archive(entryId);

      expect(archived.status).toBe('archived');
    });
  });

  // ============================================================================
  // Term Assignment
  // ============================================================================

  describe('assignTerms', () => {
    let entryId: string;

    beforeEach(async () => {
      const term1 = createTerm({ id: 'term-1', taxonomyId: 'tax-1', taxonomySlug: 'cat', count: 0 });
      const term2 = createTerm({ id: 'term-2', taxonomyId: 'tax-1', taxonomySlug: 'cat', count: 0 });
      testDb.terms.insert(term1);
      testDb.terms.insert(term2);

      const entry = createEntry({
        contentTypeId,
        contentTypeSlug: 'blog-post',
        taxonomyTerms: [],
      });
      testDb.entries.insert(entry);
      entryId = entry.id;
    });

    it('should assign terms to entry', async () => {
      const updated = await entryService.assignTerms(entryId, ['term-1', 'term-2']);

      expect(updated.taxonomyTerms).toContain('term-1');
      expect(updated.taxonomyTerms).toContain('term-2');
    });

    it('should update term counts', async () => {
      await entryService.assignTerms(entryId, ['term-1']);

      const term = testDb.terms.findOne({ id: 'term-1' });
      expect(term?.count).toBe(1);
    });

    it('should replace existing terms', async () => {
      await entryService.assignTerms(entryId, ['term-1']);
      await entryService.assignTerms(entryId, ['term-2']);

      const entry = await entryService.findById(entryId);
      expect(entry?.taxonomyTerms).toHaveLength(1);
      expect(entry?.taxonomyTerms).toContain('term-2');
    });
  });

  describe('findByTerm', () => {
    beforeEach(async () => {
      const term = createTerm({ id: 'term-1', taxonomyId: 'tax-1', taxonomySlug: 'cat' });
      testDb.terms.insert(term);

      testDb.entries.insert(
        createEntry({
          contentTypeId,
          contentTypeSlug: 'blog-post',
          title: 'Tagged',
          taxonomyTerms: ['term-1'],
        })
      );
      testDb.entries.insert(
        createEntry({
          contentTypeId,
          contentTypeSlug: 'blog-post',
          title: 'Untagged',
          taxonomyTerms: [],
        })
      );
    });

    it('should find entries by term', async () => {
      const result = await entryService.findByTerm('term-1');

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]?.title).toBe('Tagged');
    });

    it('should support pagination', async () => {
      const result = await entryService.findByTerm('term-1', { page: 1, limit: 10 });

      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });
  });
});
