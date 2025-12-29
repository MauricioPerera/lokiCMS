/**
 * TermService Tests
 * Tests for term management, hierarchies, and tree operations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../../utils/test-db.js';
import { createTaxonomy } from '../../utils/factories/taxonomy.factory.js';
import { createTerm, createChildTerm, createTermHierarchy } from '../../utils/factories/term.factory.js';

// Mock the database module
vi.mock('../../../db/index.js', () => ({
  getTaxonomiesCollection: vi.fn(),
  getTermsCollection: vi.fn(),
}));

import { getTaxonomiesCollection, getTermsCollection } from '../../../db/index.js';
import { TermService } from '../../../services/taxonomy.service.js';

describe('TermService', () => {
  let testDb: TestDatabase;
  let termService: TermService;
  let taxonomyId: string;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    vi.mocked(getTaxonomiesCollection).mockReturnValue(testDb.taxonomies as any);
    vi.mocked(getTermsCollection).mockReturnValue(testDb.terms as any);
    termService = new TermService();

    // Create a default taxonomy for tests
    const tax = createTaxonomy({
      name: 'Categories',
      slug: 'categories',
      hierarchical: true,
    });
    testDb.taxonomies.insert(tax);
    taxonomyId = tax.id;
  });

  afterEach(async () => {
    await testDb.cleanup();
    vi.clearAllMocks();
  });

  // ============================================================================
  // Term Creation
  // ============================================================================

  describe('create', () => {
    it('should create a term with valid input', async () => {
      const term = await termService.create({
        taxonomyId,
        name: 'Technology',
      });

      expect(term.name).toBe('Technology');
      expect(term.taxonomyId).toBe(taxonomyId);
      expect(term.taxonomySlug).toBe('categories');
      expect(term.id).toBeDefined();
    });

    it('should generate slug from name', async () => {
      const term = await termService.create({
        taxonomyId,
        name: 'Web Development',
      });

      expect(term.slug).toBe('web-development');
    });

    it('should use provided slug', async () => {
      const term = await termService.create({
        taxonomyId,
        name: 'Tech',
        slug: 'custom-tech-slug',
      });

      expect(term.slug).toBe('custom-tech-slug');
    });

    it('should resolve taxonomy by slug', async () => {
      const term = await termService.create({
        taxonomySlug: 'categories',
        name: 'Business',
      });

      expect(term.taxonomyId).toBe(taxonomyId);
    });

    it('should throw error for non-existent taxonomy', async () => {
      await expect(
        termService.create({
          taxonomyId: 'nonexistent-id',
          name: 'Test',
        })
      ).rejects.toThrow('Taxonomy not found');
    });

    it('should throw error for duplicate slug in same taxonomy', async () => {
      await termService.create({
        taxonomyId,
        name: 'First',
        slug: 'my-slug',
      });

      await expect(
        termService.create({
          taxonomyId,
          name: 'Second',
          slug: 'my-slug',
        })
      ).rejects.toThrow("Term with slug 'my-slug' already exists in this taxonomy");
    });

    it('should allow same slug in different taxonomies', async () => {
      const tax2 = createTaxonomy({ name: 'Tags', slug: 'tags' });
      testDb.taxonomies.insert(tax2);

      await termService.create({
        taxonomyId,
        name: 'Tech',
        slug: 'tech',
      });

      const term2 = await termService.create({
        taxonomyId: tax2.id,
        name: 'Tech',
        slug: 'tech',
      });

      expect(term2.slug).toBe('tech');
    });

    it('should create term with parent', async () => {
      const parent = await termService.create({
        taxonomyId,
        name: 'Parent',
      });

      const child = await termService.create({
        taxonomyId,
        name: 'Child',
        parentId: parent.id,
      });

      expect(child.parentId).toBe(parent.id);
    });

    it('should throw error for parent on non-hierarchical taxonomy', async () => {
      const flatTax = createTaxonomy({
        name: 'Tags',
        slug: 'tags',
        hierarchical: false,
      });
      testDb.taxonomies.insert(flatTax);

      const term1 = await termService.create({
        taxonomyId: flatTax.id,
        name: 'First',
      });

      await expect(
        termService.create({
          taxonomyId: flatTax.id,
          name: 'Second',
          parentId: term1.id,
        })
      ).rejects.toThrow('Cannot set parent on non-hierarchical taxonomy');
    });

    it('should throw error for non-existent parent', async () => {
      await expect(
        termService.create({
          taxonomyId,
          name: 'Orphan',
          parentId: 'nonexistent-parent',
        })
      ).rejects.toThrow('Parent term not found');
    });

    it('should set default values', async () => {
      const term = await termService.create({
        taxonomyId,
        name: 'Test',
      });

      expect(term.order).toBe(0);
      expect(term.count).toBe(0);
      expect(term.metadata).toEqual({});
    });

    it('should set timestamps', async () => {
      const before = Date.now();
      const term = await termService.create({
        taxonomyId,
        name: 'Test',
      });
      const after = Date.now();

      expect(term.createdAt).toBeGreaterThanOrEqual(before);
      expect(term.createdAt).toBeLessThanOrEqual(after);
    });

    it('should create term with description', async () => {
      const term = await termService.create({
        taxonomyId,
        name: 'Technology',
        description: 'Tech related posts',
      });

      expect(term.description).toBe('Tech related posts');
    });

    it('should create term with custom order', async () => {
      const term = await termService.create({
        taxonomyId,
        name: 'Priority',
        order: 5,
      });

      expect(term.order).toBe(5);
    });

    it('should create term with metadata', async () => {
      const term = await termService.create({
        taxonomyId,
        name: 'Featured',
        metadata: { icon: 'star', color: '#ff0000' },
      });

      expect(term.metadata).toEqual({ icon: 'star', color: '#ff0000' });
    });
  });

  // ============================================================================
  // Term Retrieval
  // ============================================================================

  describe('findByTaxonomy', () => {
    beforeEach(async () => {
      await termService.create({ taxonomyId, name: 'Term 1', order: 2 });
      await termService.create({ taxonomyId, name: 'Term 2', order: 0 });
      await termService.create({ taxonomyId, name: 'Term 3', order: 1 });
    });

    it('should return all terms for taxonomy', async () => {
      const terms = await termService.findByTaxonomy(taxonomyId);

      expect(terms).toHaveLength(3);
    });

    it('should return terms sorted by order', async () => {
      const terms = await termService.findByTaxonomy(taxonomyId);

      expect(terms[0]?.name).toBe('Term 2');
      expect(terms[1]?.name).toBe('Term 3');
      expect(terms[2]?.name).toBe('Term 1');
    });

    it('should return empty array for taxonomy with no terms', async () => {
      const tax2 = createTaxonomy({ name: 'Empty', slug: 'empty' });
      testDb.taxonomies.insert(tax2);

      const terms = await termService.findByTaxonomy(tax2.id);

      expect(terms).toHaveLength(0);
    });
  });

  describe('findByTaxonomySlug', () => {
    beforeEach(async () => {
      await termService.create({ taxonomyId, name: 'Term A' });
      await termService.create({ taxonomyId, name: 'Term B' });
    });

    it('should return terms by taxonomy slug', async () => {
      const terms = await termService.findByTaxonomySlug('categories');

      expect(terms).toHaveLength(2);
    });
  });

  describe('findById', () => {
    let termId: string;

    beforeEach(async () => {
      const term = await termService.create({
        taxonomyId,
        name: 'Find Me',
      });
      termId = term.id;
    });

    it('should find term by ID', async () => {
      const term = await termService.findById(termId);

      expect(term).not.toBeNull();
      expect(term?.name).toBe('Find Me');
    });

    it('should return null for non-existent ID', async () => {
      const term = await termService.findById('nonexistent-id');

      expect(term).toBeNull();
    });
  });

  describe('findBySlug', () => {
    beforeEach(async () => {
      await termService.create({
        taxonomyId,
        name: 'My Term',
        slug: 'my-term',
      });
    });

    it('should find term by slug and taxonomy', async () => {
      const term = await termService.findBySlug('my-term', 'categories');

      expect(term).not.toBeNull();
      expect(term?.name).toBe('My Term');
    });

    it('should return null for non-existent slug', async () => {
      const term = await termService.findBySlug('nonexistent', 'categories');

      expect(term).toBeNull();
    });
  });

  // ============================================================================
  // Term Update
  // ============================================================================

  describe('update', () => {
    let termId: string;

    beforeEach(async () => {
      const term = await termService.create({
        taxonomyId,
        name: 'Original Name',
        description: 'Original',
      });
      termId = term.id;
    });

    it('should update term name', async () => {
      const updated = await termService.update(termId, { name: 'New Name' });

      expect(updated.name).toBe('New Name');
    });

    it('should update term slug', async () => {
      const updated = await termService.update(termId, { slug: 'new-slug' });

      expect(updated.slug).toBe('new-slug');
    });

    it('should update description', async () => {
      const updated = await termService.update(termId, {
        description: 'New description',
      });

      expect(updated.description).toBe('New description');
    });

    it('should update order', async () => {
      const updated = await termService.update(termId, { order: 10 });

      expect(updated.order).toBe(10);
    });

    it('should throw error for non-existent term', async () => {
      await expect(
        termService.update('nonexistent-id', { name: 'New' })
      ).rejects.toThrow("Term with id 'nonexistent-id' not found");
    });

    it('should throw error for duplicate slug', async () => {
      await termService.create({
        taxonomyId,
        name: 'Existing',
        slug: 'existing-slug',
      });

      await expect(
        termService.update(termId, { slug: 'existing-slug' })
      ).rejects.toThrow("Term with slug 'existing-slug' already exists");
    });

    it('should update updatedAt timestamp', async () => {
      const before = Date.now();
      const updated = await termService.update(termId, { name: 'New' });
      const after = Date.now();

      expect(updated.updatedAt).toBeGreaterThanOrEqual(before);
      expect(updated.updatedAt).toBeLessThanOrEqual(after);
    });

    it('should remove parent when set to null', async () => {
      const parent = await termService.create({
        taxonomyId,
        name: 'Parent',
      });

      const doc = testDb.terms.findOne({ id: termId });
      if (doc) {
        doc.parentId = parent.id;
        testDb.terms.update(doc);
      }

      const updated = await termService.update(termId, { parentId: null });

      expect(updated.parentId).toBeUndefined();
    });

    it('should change parent', async () => {
      const newParent = await termService.create({
        taxonomyId,
        name: 'New Parent',
      });

      const updated = await termService.update(termId, { parentId: newParent.id });

      expect(updated.parentId).toBe(newParent.id);
    });

    it('should throw error when setting self as parent', async () => {
      await expect(
        termService.update(termId, { parentId: termId })
      ).rejects.toThrow('Term cannot be its own parent');
    });

    it('should throw error for non-existent parent', async () => {
      await expect(
        termService.update(termId, { parentId: 'nonexistent-parent' })
      ).rejects.toThrow('Parent term not found');
    });

    it('should throw error for circular parent reference', async () => {
      // Create hierarchy: term1 -> term2 -> term3
      const term1 = await termService.create({ taxonomyId, name: 'Term 1' });
      const term2 = await termService.create({
        taxonomyId,
        name: 'Term 2',
        parentId: term1.id,
      });
      const term3 = await termService.create({
        taxonomyId,
        name: 'Term 3',
        parentId: term2.id,
      });

      // Try to make term1 a child of term3 (circular)
      await expect(
        termService.update(term1.id, { parentId: term3.id })
      ).rejects.toThrow('Circular parent reference detected');
    });
  });

  // ============================================================================
  // Term Delete
  // ============================================================================

  describe('delete', () => {
    let termId: string;

    beforeEach(async () => {
      const term = await termService.create({
        taxonomyId,
        name: 'Delete Me',
      });
      termId = term.id;
    });

    it('should delete term', async () => {
      await termService.delete(termId);

      const term = await termService.findById(termId);
      expect(term).toBeNull();
    });

    it('should throw error for non-existent term', async () => {
      await expect(termService.delete('nonexistent-id')).rejects.toThrow(
        "Term with id 'nonexistent-id' not found"
      );
    });

    it('should move children to parent when deleting', async () => {
      const parent = await termService.create({
        taxonomyId,
        name: 'Grandparent',
      });

      const middle = await termService.create({
        taxonomyId,
        name: 'Parent',
        parentId: parent.id,
      });

      const child = await termService.create({
        taxonomyId,
        name: 'Child',
        parentId: middle.id,
      });

      await termService.delete(middle.id);

      const updatedChild = await termService.findById(child.id);
      expect(updatedChild?.parentId).toBe(parent.id);
    });

    it('should make children root when deleting root parent', async () => {
      const child = await termService.create({
        taxonomyId,
        name: 'Child',
        parentId: termId,
      });

      await termService.delete(termId);

      const updatedChild = await termService.findById(child.id);
      expect(updatedChild?.parentId).toBeUndefined();
    });
  });

  // ============================================================================
  // Term Hierarchy
  // ============================================================================

  describe('getChildren', () => {
    let parentId: string;

    beforeEach(async () => {
      const parent = await termService.create({ taxonomyId, name: 'Parent' });
      parentId = parent.id;

      await termService.create({
        taxonomyId,
        name: 'Child 1',
        parentId,
        order: 1,
      });
      await termService.create({
        taxonomyId,
        name: 'Child 2',
        parentId,
        order: 0,
      });
      await termService.create({
        taxonomyId,
        name: 'Sibling',
      });
    });

    it('should return direct children', async () => {
      const children = await termService.getChildren(parentId);

      expect(children).toHaveLength(2);
    });

    it('should return children sorted by order', async () => {
      const children = await termService.getChildren(parentId);

      expect(children[0]?.name).toBe('Child 2');
      expect(children[1]?.name).toBe('Child 1');
    });

    it('should return empty array for term with no children', async () => {
      const leaf = await termService.create({ taxonomyId, name: 'Leaf' });

      const children = await termService.getChildren(leaf.id);

      expect(children).toHaveLength(0);
    });
  });

  describe('getTermTree', () => {
    beforeEach(async () => {
      // Create hierarchy:
      // - Parent 1
      //   - Child 1.1
      //   - Child 1.2
      //     - Grandchild 1.2.1
      // - Parent 2
      const parent1 = await termService.create({
        taxonomyId,
        name: 'Parent 1',
        order: 0,
      });
      await termService.create({
        taxonomyId,
        name: 'Child 1.1',
        parentId: parent1.id,
        order: 0,
      });
      const child12 = await termService.create({
        taxonomyId,
        name: 'Child 1.2',
        parentId: parent1.id,
        order: 1,
      });
      await termService.create({
        taxonomyId,
        name: 'Grandchild 1.2.1',
        parentId: child12.id,
      });
      await termService.create({
        taxonomyId,
        name: 'Parent 2',
        order: 1,
      });
    });

    it('should build term tree', async () => {
      const tree = await termService.getTermTree(taxonomyId);

      expect(tree).toHaveLength(2); // Root nodes
    });

    it('should include children in tree nodes', async () => {
      const tree = await termService.getTermTree(taxonomyId);
      const parent1 = tree.find(t => t.name === 'Parent 1');

      expect(parent1?.children).toHaveLength(2);
    });

    it('should include nested children', async () => {
      const tree = await termService.getTermTree(taxonomyId);
      const parent1 = tree.find(t => t.name === 'Parent 1');
      const child12 = parent1?.children.find(c => c.name === 'Child 1.2');

      expect(child12?.children).toHaveLength(1);
      expect(child12?.children[0]?.name).toBe('Grandchild 1.2.1');
    });

    it('should return empty array for empty taxonomy', async () => {
      const tax2 = createTaxonomy({ name: 'Empty', slug: 'empty' });
      testDb.taxonomies.insert(tax2);

      const tree = await termService.getTermTree(tax2.id);

      expect(tree).toHaveLength(0);
    });
  });

  // ============================================================================
  // Term Reordering
  // ============================================================================

  describe('reorder', () => {
    let termIds: string[];

    beforeEach(async () => {
      termIds = [];
      for (let i = 0; i < 3; i++) {
        const term = await termService.create({
          taxonomyId,
          name: `Term ${i}`,
          order: i,
        });
        termIds.push(term.id);
      }
    });

    it('should reorder terms', async () => {
      // Reverse order
      await termService.reorder([termIds[2]!, termIds[1]!, termIds[0]!]);

      const terms = await termService.findByTaxonomy(taxonomyId);
      expect(terms[0]?.id).toBe(termIds[2]);
      expect(terms[1]?.id).toBe(termIds[1]);
      expect(terms[2]?.id).toBe(termIds[0]);
    });

    it('should set correct order values', async () => {
      await termService.reorder([termIds[2]!, termIds[0]!, termIds[1]!]);

      const term0 = await termService.findById(termIds[0]!);
      const term1 = await termService.findById(termIds[1]!);
      const term2 = await termService.findById(termIds[2]!);

      expect(term2?.order).toBe(0);
      expect(term0?.order).toBe(1);
      expect(term1?.order).toBe(2);
    });

    it('should update timestamps on reorder', async () => {
      const before = Date.now();
      await termService.reorder(termIds);
      const after = Date.now();

      const term = await termService.findById(termIds[0]!);
      expect(term?.updatedAt).toBeGreaterThanOrEqual(before);
      expect(term?.updatedAt).toBeLessThanOrEqual(after);
    });

    it('should skip non-existent term IDs', async () => {
      await termService.reorder(['nonexistent', termIds[0]!, termIds[1]!]);

      const term0 = await termService.findById(termIds[0]!);
      const term1 = await termService.findById(termIds[1]!);

      expect(term0?.order).toBe(1);
      expect(term1?.order).toBe(2);
    });
  });
});
