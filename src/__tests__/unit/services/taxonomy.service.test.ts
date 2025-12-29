/**
 * TaxonomyService Tests
 * Tests for taxonomy management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../../utils/test-db.js';
import { createTaxonomy, createCategoryTaxonomy, createTagTaxonomy } from '../../utils/factories/taxonomy.factory.js';
import { createTerm } from '../../utils/factories/term.factory.js';

// Mock the database module
vi.mock('../../../db/index.js', () => ({
  getTaxonomiesCollection: vi.fn(),
  getTermsCollection: vi.fn(),
}));

import { getTaxonomiesCollection, getTermsCollection } from '../../../db/index.js';
import { TaxonomyService } from '../../../services/taxonomy.service.js';

describe('TaxonomyService', () => {
  let testDb: TestDatabase;
  let taxonomyService: TaxonomyService;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    vi.mocked(getTaxonomiesCollection).mockReturnValue(testDb.taxonomies as any);
    vi.mocked(getTermsCollection).mockReturnValue(testDb.terms as any);
    taxonomyService = new TaxonomyService();
  });

  afterEach(async () => {
    await testDb.cleanup();
    vi.clearAllMocks();
  });

  // ============================================================================
  // Taxonomy Creation
  // ============================================================================

  describe('create', () => {
    it('should create a taxonomy with valid input', async () => {
      const taxonomy = await taxonomyService.create({
        name: 'Categories',
        slug: 'categories',
        description: 'Blog categories',
      });

      expect(taxonomy.name).toBe('Categories');
      expect(taxonomy.slug).toBe('categories');
      expect(taxonomy.description).toBe('Blog categories');
      expect(taxonomy.id).toBeDefined();
    });

    it('should set default values', async () => {
      const taxonomy = await taxonomyService.create({
        name: 'Tags',
        slug: 'tags',
      });

      expect(taxonomy.hierarchical).toBe(false);
      expect(taxonomy.allowMultiple).toBe(true);
      expect(taxonomy.contentTypes).toEqual([]);
    });

    it('should create hierarchical taxonomy', async () => {
      const taxonomy = await taxonomyService.create({
        name: 'Categories',
        slug: 'categories',
        hierarchical: true,
      });

      expect(taxonomy.hierarchical).toBe(true);
    });

    it('should create taxonomy with content type restrictions', async () => {
      const taxonomy = await taxonomyService.create({
        name: 'Tags',
        slug: 'tags',
        contentTypes: ['blog-post', 'article'],
      });

      expect(taxonomy.contentTypes).toContain('blog-post');
      expect(taxonomy.contentTypes).toContain('article');
    });

    it('should throw error for duplicate slug', async () => {
      await taxonomyService.create({
        name: 'First',
        slug: 'my-slug',
      });

      await expect(
        taxonomyService.create({
          name: 'Second',
          slug: 'my-slug',
        })
      ).rejects.toThrow("Taxonomy with slug 'my-slug' already exists");
    });

    it('should generate unique IDs', async () => {
      const tax1 = await taxonomyService.create({ name: 'Tax 1', slug: 'tax-1' });
      const tax2 = await taxonomyService.create({ name: 'Tax 2', slug: 'tax-2' });

      expect(tax1.id).not.toBe(tax2.id);
    });

    it('should set timestamps', async () => {
      const before = Date.now();
      const taxonomy = await taxonomyService.create({
        name: 'Tags',
        slug: 'tags',
      });
      const after = Date.now();

      expect(taxonomy.createdAt).toBeGreaterThanOrEqual(before);
      expect(taxonomy.createdAt).toBeLessThanOrEqual(after);
      expect(taxonomy.updatedAt).toEqual(taxonomy.createdAt);
    });

    it('should create taxonomy with allowMultiple false', async () => {
      const taxonomy = await taxonomyService.create({
        name: 'Primary Category',
        slug: 'primary-category',
        allowMultiple: false,
      });

      expect(taxonomy.allowMultiple).toBe(false);
    });
  });

  // ============================================================================
  // Taxonomy Retrieval
  // ============================================================================

  describe('findAll', () => {
    beforeEach(async () => {
      await taxonomyService.create({ name: 'Categories', slug: 'categories' });
      await taxonomyService.create({ name: 'Tags', slug: 'tags' });
      await taxonomyService.create({ name: 'Authors', slug: 'authors' });
    });

    it('should return all taxonomies', async () => {
      const taxonomies = await taxonomyService.findAll();

      expect(taxonomies).toHaveLength(3);
    });

    it('should not include LokiJS metadata', async () => {
      const taxonomies = await taxonomyService.findAll();

      taxonomies.forEach(tax => {
        expect(tax).not.toHaveProperty('$loki');
        expect(tax).not.toHaveProperty('meta');
      });
    });
  });

  describe('findById', () => {
    let taxonomyId: string;

    beforeEach(async () => {
      const tax = await taxonomyService.create({
        name: 'Find By ID',
        slug: 'find-by-id',
      });
      taxonomyId = tax.id;
    });

    it('should find taxonomy by ID', async () => {
      const taxonomy = await taxonomyService.findById(taxonomyId);

      expect(taxonomy).not.toBeNull();
      expect(taxonomy?.name).toBe('Find By ID');
    });

    it('should return null for non-existent ID', async () => {
      const taxonomy = await taxonomyService.findById('nonexistent-id');

      expect(taxonomy).toBeNull();
    });
  });

  describe('findBySlug', () => {
    beforeEach(async () => {
      await taxonomyService.create({
        name: 'Find By Slug',
        slug: 'find-by-slug',
      });
    });

    it('should find taxonomy by slug', async () => {
      const taxonomy = await taxonomyService.findBySlug('find-by-slug');

      expect(taxonomy).not.toBeNull();
      expect(taxonomy?.name).toBe('Find By Slug');
    });

    it('should return null for non-existent slug', async () => {
      const taxonomy = await taxonomyService.findBySlug('nonexistent-slug');

      expect(taxonomy).toBeNull();
    });
  });

  describe('findByContentType', () => {
    beforeEach(async () => {
      await taxonomyService.create({
        name: 'Blog Categories',
        slug: 'blog-categories',
        contentTypes: ['blog-post'],
      });
      await taxonomyService.create({
        name: 'Article Categories',
        slug: 'article-categories',
        contentTypes: ['article'],
      });
      await taxonomyService.create({
        name: 'Global Tags',
        slug: 'global-tags',
        contentTypes: ['blog-post', 'article'],
      });
    });

    it('should find taxonomies for content type', async () => {
      const taxonomies = await taxonomyService.findByContentType('blog-post');

      expect(taxonomies).toHaveLength(2);
      expect(taxonomies.map(t => t.slug)).toContain('blog-categories');
      expect(taxonomies.map(t => t.slug)).toContain('global-tags');
    });

    it('should return empty array for non-existent content type', async () => {
      const taxonomies = await taxonomyService.findByContentType('nonexistent');

      expect(taxonomies).toHaveLength(0);
    });
  });

  // ============================================================================
  // Taxonomy Update
  // ============================================================================

  describe('update', () => {
    let taxonomyId: string;

    beforeEach(async () => {
      const tax = await taxonomyService.create({
        name: 'Update Test',
        slug: 'update-test',
        description: 'Original',
      });
      taxonomyId = tax.id;
    });

    it('should update taxonomy name', async () => {
      const updated = await taxonomyService.update(taxonomyId, { name: 'New Name' });

      expect(updated.name).toBe('New Name');
    });

    it('should update taxonomy slug', async () => {
      const updated = await taxonomyService.update(taxonomyId, { slug: 'new-slug' });

      expect(updated.slug).toBe('new-slug');
    });

    it('should update description', async () => {
      const updated = await taxonomyService.update(taxonomyId, {
        description: 'New description',
      });

      expect(updated.description).toBe('New description');
    });

    it('should update hierarchical', async () => {
      const updated = await taxonomyService.update(taxonomyId, { hierarchical: true });

      expect(updated.hierarchical).toBe(true);
    });

    it('should update contentTypes', async () => {
      const updated = await taxonomyService.update(taxonomyId, {
        contentTypes: ['blog-post', 'page'],
      });

      expect(updated.contentTypes).toEqual(['blog-post', 'page']);
    });

    it('should throw error for non-existent taxonomy', async () => {
      await expect(
        taxonomyService.update('nonexistent-id', { name: 'New' })
      ).rejects.toThrow("Taxonomy with id 'nonexistent-id' not found");
    });

    it('should throw error for duplicate slug', async () => {
      await taxonomyService.create({
        name: 'Existing',
        slug: 'existing-slug',
      });

      await expect(
        taxonomyService.update(taxonomyId, { slug: 'existing-slug' })
      ).rejects.toThrow("Taxonomy with slug 'existing-slug' already exists");
    });

    it('should update updatedAt timestamp', async () => {
      const before = Date.now();
      const updated = await taxonomyService.update(taxonomyId, { name: 'New' });
      const after = Date.now();

      expect(updated.updatedAt).toBeGreaterThanOrEqual(before);
      expect(updated.updatedAt).toBeLessThanOrEqual(after);
    });

    it('should update term taxonomySlug when taxonomy slug changes', async () => {
      // Add terms to this taxonomy
      testDb.terms.insert(
        createTerm({
          taxonomyId,
          taxonomySlug: 'update-test',
          name: 'Term 1',
        })
      );
      testDb.terms.insert(
        createTerm({
          taxonomyId,
          taxonomySlug: 'update-test',
          name: 'Term 2',
        })
      );

      await taxonomyService.update(taxonomyId, { slug: 'new-slug' });

      const terms = testDb.terms.find({ taxonomyId });
      terms.forEach(term => {
        expect(term.taxonomySlug).toBe('new-slug');
      });
    });
  });

  // ============================================================================
  // Taxonomy Delete
  // ============================================================================

  describe('delete', () => {
    let taxonomyId: string;

    beforeEach(async () => {
      const tax = await taxonomyService.create({
        name: 'Delete Test',
        slug: 'delete-test',
      });
      taxonomyId = tax.id;

      // Add some terms
      testDb.terms.insert(
        createTerm({
          taxonomyId,
          taxonomySlug: 'delete-test',
          name: 'Term 1',
        })
      );
      testDb.terms.insert(
        createTerm({
          taxonomyId,
          taxonomySlug: 'delete-test',
          name: 'Term 2',
        })
      );
    });

    it('should delete taxonomy', async () => {
      await taxonomyService.delete(taxonomyId);

      const taxonomy = await taxonomyService.findById(taxonomyId);
      expect(taxonomy).toBeNull();
    });

    it('should delete all terms in taxonomy', async () => {
      await taxonomyService.delete(taxonomyId);

      const terms = testDb.terms.find({ taxonomyId });
      expect(terms).toHaveLength(0);
    });

    it('should throw error for non-existent taxonomy', async () => {
      await expect(taxonomyService.delete('nonexistent-id')).rejects.toThrow(
        "Taxonomy with id 'nonexistent-id' not found"
      );
    });
  });

  // ============================================================================
  // Taxonomy Types
  // ============================================================================

  describe('taxonomy types', () => {
    it('should support category-style (hierarchical, single select)', async () => {
      const taxonomy = await taxonomyService.create({
        name: 'Primary Category',
        slug: 'primary-category',
        hierarchical: true,
        allowMultiple: false,
      });

      expect(taxonomy.hierarchical).toBe(true);
      expect(taxonomy.allowMultiple).toBe(false);
    });

    it('should support tag-style (flat, multiple select)', async () => {
      const taxonomy = await taxonomyService.create({
        name: 'Tags',
        slug: 'tags',
        hierarchical: false,
        allowMultiple: true,
      });

      expect(taxonomy.hierarchical).toBe(false);
      expect(taxonomy.allowMultiple).toBe(true);
    });
  });
});
