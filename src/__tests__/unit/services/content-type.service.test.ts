/**
 * ContentTypeService Tests
 * Tests for content type management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../../utils/test-db.js';
import {
  createContentType,
  createFieldDefinition,
  commonFields,
} from '../../utils/factories/content-type.factory.js';

// Mock the database and plugins modules
vi.mock('../../../db/index.js', () => ({
  getContentTypesCollection: vi.fn(),
  getEntriesCollection: vi.fn(),
}));

vi.mock('../../../plugins/index.js', () => ({
  hookSystem: {
    execute: vi.fn().mockImplementation((_event, payload) => Promise.resolve(payload)),
  },
}));

import { getContentTypesCollection, getEntriesCollection } from '../../../db/index.js';
import { ContentTypeService } from '../../../services/content-type.service.js';

describe('ContentTypeService', () => {
  let testDb: TestDatabase;
  let contentTypeService: ContentTypeService;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    vi.mocked(getContentTypesCollection).mockReturnValue(testDb.contentTypes as any);
    vi.mocked(getEntriesCollection).mockReturnValue(testDb.entries as any);
    contentTypeService = new ContentTypeService();
  });

  afterEach(async () => {
    await testDb.cleanup();
    vi.clearAllMocks();
  });

  // ============================================================================
  // Content Type Creation
  // ============================================================================

  describe('create', () => {
    it('should create a content type with valid input', async () => {
      const input = {
        name: 'Blog Post',
        slug: 'blog-post',
        description: 'A blog post content type',
      };

      const contentType = await contentTypeService.create(input);

      expect(contentType.name).toBe('Blog Post');
      expect(contentType.slug).toBe('blog-post');
      expect(contentType.description).toBe('A blog post content type');
      expect(contentType.id).toBeDefined();
    });

    it('should set default values', async () => {
      const contentType = await contentTypeService.create({
        name: 'Article',
        slug: 'article',
      });

      expect(contentType.fields).toEqual([]);
      expect(contentType.titleField).toBe('title');
      expect(contentType.enableVersioning).toBe(false);
      expect(contentType.enableDrafts).toBe(true);
      expect(contentType.enableScheduling).toBe(false);
    });

    it('should create content type with fields', async () => {
      const contentType = await contentTypeService.create({
        name: 'Article',
        slug: 'article',
        fields: [commonFields.title(), commonFields.body()],
      });

      expect(contentType.fields).toHaveLength(2);
      expect(contentType.fields[0]?.name).toBe('title');
      expect(contentType.fields[1]?.name).toBe('body');
    });

    it('should throw error for duplicate slug', async () => {
      await contentTypeService.create({
        name: 'First Type',
        slug: 'my-type',
      });

      await expect(
        contentTypeService.create({
          name: 'Second Type',
          slug: 'my-type',
        })
      ).rejects.toThrow("Content type with slug 'my-type' already exists");
    });

    it('should generate unique IDs', async () => {
      const ct1 = await contentTypeService.create({ name: 'Type 1', slug: 'type-1' });
      const ct2 = await contentTypeService.create({ name: 'Type 2', slug: 'type-2' });

      expect(ct1.id).not.toBe(ct2.id);
    });

    it('should set timestamps', async () => {
      const before = Date.now();
      const contentType = await contentTypeService.create({
        name: 'Article',
        slug: 'article',
      });
      const after = Date.now();

      expect(contentType.createdAt).toBeGreaterThanOrEqual(before);
      expect(contentType.createdAt).toBeLessThanOrEqual(after);
      expect(contentType.updatedAt).toEqual(contentType.createdAt);
    });

    it('should create content type with versioning enabled', async () => {
      const contentType = await contentTypeService.create({
        name: 'Versioned',
        slug: 'versioned',
        enableVersioning: true,
      });

      expect(contentType.enableVersioning).toBe(true);
    });

    it('should create content type with scheduling enabled', async () => {
      const contentType = await contentTypeService.create({
        name: 'Scheduled',
        slug: 'scheduled',
        enableScheduling: true,
      });

      expect(contentType.enableScheduling).toBe(true);
    });

    it('should create content type with custom title field', async () => {
      const contentType = await contentTypeService.create({
        name: 'Custom',
        slug: 'custom',
        titleField: 'headline',
      });

      expect(contentType.titleField).toBe('headline');
    });
  });

  // ============================================================================
  // Content Type Retrieval
  // ============================================================================

  describe('findAll', () => {
    beforeEach(async () => {
      await contentTypeService.create({ name: 'Type 1', slug: 'type-1' });
      await contentTypeService.create({ name: 'Type 2', slug: 'type-2' });
      await contentTypeService.create({ name: 'Type 3', slug: 'type-3' });
    });

    it('should return all content types', async () => {
      const contentTypes = await contentTypeService.findAll();

      expect(contentTypes).toHaveLength(3);
    });

    it('should not include LokiJS metadata', async () => {
      const contentTypes = await contentTypeService.findAll();

      contentTypes.forEach(ct => {
        expect(ct).not.toHaveProperty('$loki');
        expect(ct).not.toHaveProperty('meta');
      });
    });
  });

  describe('findById', () => {
    let contentTypeId: string;

    beforeEach(async () => {
      const ct = await contentTypeService.create({
        name: 'Find By ID',
        slug: 'find-by-id',
      });
      contentTypeId = ct.id;
    });

    it('should find content type by ID', async () => {
      const contentType = await contentTypeService.findById(contentTypeId);

      expect(contentType).not.toBeNull();
      expect(contentType?.name).toBe('Find By ID');
    });

    it('should return null for non-existent ID', async () => {
      const contentType = await contentTypeService.findById('nonexistent-id');

      expect(contentType).toBeNull();
    });
  });

  describe('findBySlug', () => {
    beforeEach(async () => {
      await contentTypeService.create({
        name: 'Find By Slug',
        slug: 'find-by-slug',
      });
    });

    it('should find content type by slug', async () => {
      const contentType = await contentTypeService.findBySlug('find-by-slug');

      expect(contentType).not.toBeNull();
      expect(contentType?.name).toBe('Find By Slug');
    });

    it('should return null for non-existent slug', async () => {
      const contentType = await contentTypeService.findBySlug('nonexistent-slug');

      expect(contentType).toBeNull();
    });
  });

  // ============================================================================
  // Content Type Update
  // ============================================================================

  describe('update', () => {
    let contentTypeId: string;

    beforeEach(async () => {
      const ct = await contentTypeService.create({
        name: 'Update Test',
        slug: 'update-test',
        description: 'Original description',
      });
      contentTypeId = ct.id;
    });

    it('should update content type name', async () => {
      const updated = await contentTypeService.update(contentTypeId, {
        name: 'New Name',
      });

      expect(updated.name).toBe('New Name');
      expect(updated.slug).toBe('update-test'); // unchanged
    });

    it('should update content type slug', async () => {
      const updated = await contentTypeService.update(contentTypeId, {
        slug: 'new-slug',
      });

      expect(updated.slug).toBe('new-slug');
    });

    it('should update description', async () => {
      const updated = await contentTypeService.update(contentTypeId, {
        description: 'New description',
      });

      expect(updated.description).toBe('New description');
    });

    it('should update fields', async () => {
      const updated = await contentTypeService.update(contentTypeId, {
        fields: [commonFields.title(), commonFields.body()],
      });

      expect(updated.fields).toHaveLength(2);
    });

    it('should throw error for non-existent content type', async () => {
      await expect(
        contentTypeService.update('nonexistent-id', { name: 'New Name' })
      ).rejects.toThrow("Content type with id 'nonexistent-id' not found");
    });

    it('should throw error for duplicate slug', async () => {
      await contentTypeService.create({
        name: 'Existing',
        slug: 'existing-slug',
      });

      await expect(
        contentTypeService.update(contentTypeId, { slug: 'existing-slug' })
      ).rejects.toThrow("Content type with slug 'existing-slug' already exists");
    });

    it('should allow same slug if not changed', async () => {
      const updated = await contentTypeService.update(contentTypeId, {
        slug: 'update-test',
        name: 'Changed Name',
      });

      expect(updated.slug).toBe('update-test');
      expect(updated.name).toBe('Changed Name');
    });

    it('should update updatedAt timestamp', async () => {
      const before = Date.now();
      const updated = await contentTypeService.update(contentTypeId, {
        name: 'New Name',
      });
      const after = Date.now();

      expect(updated.updatedAt).toBeGreaterThanOrEqual(before);
      expect(updated.updatedAt).toBeLessThanOrEqual(after);
    });

    it('should update enableVersioning', async () => {
      const updated = await contentTypeService.update(contentTypeId, {
        enableVersioning: true,
      });

      expect(updated.enableVersioning).toBe(true);
    });
  });

  // ============================================================================
  // Content Type Delete
  // ============================================================================

  describe('delete', () => {
    let contentTypeId: string;

    beforeEach(async () => {
      const ct = await contentTypeService.create({
        name: 'Delete Test',
        slug: 'delete-test',
      });
      contentTypeId = ct.id;
    });

    it('should delete content type', async () => {
      await contentTypeService.delete(contentTypeId);

      const contentType = await contentTypeService.findById(contentTypeId);
      expect(contentType).toBeNull();
    });

    it('should throw error for non-existent content type', async () => {
      await expect(contentTypeService.delete('nonexistent-id')).rejects.toThrow(
        "Content type with id 'nonexistent-id' not found"
      );
    });

    it('should throw error if entries are using the content type', async () => {
      // Add an entry using this content type
      testDb.entries.insert({
        id: 'entry-1',
        contentTypeId,
        contentTypeSlug: 'delete-test',
        title: 'Test Entry',
        slug: 'test-entry',
        content: {},
        metadata: {},
        status: 'draft',
        authorId: 'user-1',
        taxonomyTerms: [],
        version: 1,
        locale: 'en',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await expect(contentTypeService.delete(contentTypeId)).rejects.toThrow(
        /Cannot delete content type.*1 entries are using it/
      );
    });
  });

  // ============================================================================
  // Entries Count
  // ============================================================================

  describe('getEntriesCount', () => {
    let contentTypeId: string;

    beforeEach(async () => {
      const ct = await contentTypeService.create({
        name: 'Count Test',
        slug: 'count-test',
      });
      contentTypeId = ct.id;
    });

    it('should return 0 for empty content type', async () => {
      const count = await contentTypeService.getEntriesCount(contentTypeId);

      expect(count).toBe(0);
    });

    it('should return correct count', async () => {
      // Add entries
      testDb.entries.insert({
        id: 'entry-1',
        contentTypeId,
        contentTypeSlug: 'count-test',
        title: 'Entry 1',
        slug: 'entry-1',
        content: {},
        metadata: {},
        status: 'draft',
        authorId: 'user-1',
        taxonomyTerms: [],
        version: 1,
        locale: 'en',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      testDb.entries.insert({
        id: 'entry-2',
        contentTypeId,
        contentTypeSlug: 'count-test',
        title: 'Entry 2',
        slug: 'entry-2',
        content: {},
        metadata: {},
        status: 'draft',
        authorId: 'user-1',
        taxonomyTerms: [],
        version: 1,
        locale: 'en',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const count = await contentTypeService.getEntriesCount(contentTypeId);

      expect(count).toBe(2);
    });
  });

  // ============================================================================
  // Field Management
  // ============================================================================

  describe('addField', () => {
    let contentTypeId: string;

    beforeEach(async () => {
      const ct = await contentTypeService.create({
        name: 'Field Test',
        slug: 'field-test',
        fields: [commonFields.title()],
      });
      contentTypeId = ct.id;
    });

    it('should add a new field', async () => {
      const updated = await contentTypeService.addField(contentTypeId, commonFields.body());

      expect(updated.fields).toHaveLength(2);
      expect(updated.fields[1]?.name).toBe('body');
    });

    it('should throw error for duplicate field name', async () => {
      await expect(
        contentTypeService.addField(contentTypeId, commonFields.title())
      ).rejects.toThrow("Field 'title' already exists in content type");
    });

    it('should throw error for non-existent content type', async () => {
      await expect(
        contentTypeService.addField('nonexistent-id', commonFields.body())
      ).rejects.toThrow("Content type with id 'nonexistent-id' not found");
    });

    it('should update updatedAt timestamp', async () => {
      const before = Date.now();
      const updated = await contentTypeService.addField(contentTypeId, commonFields.body());
      const after = Date.now();

      expect(updated.updatedAt).toBeGreaterThanOrEqual(before);
      expect(updated.updatedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('removeField', () => {
    let contentTypeId: string;

    beforeEach(async () => {
      const ct = await contentTypeService.create({
        name: 'Remove Field Test',
        slug: 'remove-field-test',
        fields: [commonFields.title(), commonFields.body()],
      });
      contentTypeId = ct.id;
    });

    it('should remove a field', async () => {
      const updated = await contentTypeService.removeField(contentTypeId, 'body');

      expect(updated.fields).toHaveLength(1);
      expect(updated.fields[0]?.name).toBe('title');
    });

    it('should throw error for non-existent content type', async () => {
      await expect(
        contentTypeService.removeField('nonexistent-id', 'content')
      ).rejects.toThrow("Content type with id 'nonexistent-id' not found");
    });

    it('should not throw error for non-existent field', async () => {
      // Should just filter and result in same fields
      const updated = await contentTypeService.removeField(contentTypeId, 'nonexistent');

      expect(updated.fields).toHaveLength(2);
    });
  });

  describe('updateField', () => {
    let contentTypeId: string;

    beforeEach(async () => {
      const ct = await contentTypeService.create({
        name: 'Update Field Test',
        slug: 'update-field-test',
        fields: [
          {
            name: 'title',
            type: 'text',
            label: 'Title',
            required: true,
          },
        ],
      });
      contentTypeId = ct.id;
    });

    it('should update field properties', async () => {
      const updated = await contentTypeService.updateField(contentTypeId, 'title', {
        label: 'New Label',
        required: false,
      });

      expect(updated.fields[0]?.label).toBe('New Label');
      expect(updated.fields[0]?.required).toBe(false);
    });

    it('should throw error for non-existent content type', async () => {
      await expect(
        contentTypeService.updateField('nonexistent-id', 'title', { label: 'New' })
      ).rejects.toThrow("Content type with id 'nonexistent-id' not found");
    });

    it('should throw error for non-existent field', async () => {
      await expect(
        contentTypeService.updateField(contentTypeId, 'nonexistent', { label: 'New' })
      ).rejects.toThrow("Field 'nonexistent' not found in content type");
    });

    it('should preserve other field properties', async () => {
      const updated = await contentTypeService.updateField(contentTypeId, 'title', {
        description: 'A description',
      });

      expect(updated.fields[0]?.name).toBe('title');
      expect(updated.fields[0]?.type).toBe('text');
      expect(updated.fields[0]?.label).toBe('Title');
      expect(updated.fields[0]?.description).toBe('A description');
    });
  });

  // ============================================================================
  // Field Types
  // ============================================================================

  describe('field types', () => {
    it('should support text field', async () => {
      const ct = await contentTypeService.create({
        name: 'Text Fields',
        slug: 'text-fields',
        fields: [createFieldDefinition('shortText', 'text')],
      });

      expect(ct.fields[0]?.type).toBe('text');
    });

    it('should support textarea field', async () => {
      const ct = await contentTypeService.create({
        name: 'Textarea Fields',
        slug: 'textarea-fields',
        fields: [createFieldDefinition('longText', 'textarea')],
      });

      expect(ct.fields[0]?.type).toBe('textarea');
    });

    it('should support richtext field', async () => {
      const ct = await contentTypeService.create({
        name: 'RichText Fields',
        slug: 'richtext-fields',
        fields: [createFieldDefinition('body', 'richtext')],
      });

      expect(ct.fields[0]?.type).toBe('richtext');
    });

    it('should support number field', async () => {
      const ct = await contentTypeService.create({
        name: 'Number Fields',
        slug: 'number-fields',
        fields: [createFieldDefinition('count', 'number')],
      });

      expect(ct.fields[0]?.type).toBe('number');
    });

    it('should support boolean field', async () => {
      const ct = await contentTypeService.create({
        name: 'Boolean Fields',
        slug: 'boolean-fields',
        fields: [createFieldDefinition('featured', 'boolean')],
      });

      expect(ct.fields[0]?.type).toBe('boolean');
    });

    it('should support date field', async () => {
      const ct = await contentTypeService.create({
        name: 'Date Fields',
        slug: 'date-fields',
        fields: [createFieldDefinition('publishDate', 'date')],
      });

      expect(ct.fields[0]?.type).toBe('date');
    });

    it('should support datetime field', async () => {
      const ct = await contentTypeService.create({
        name: 'DateTime Fields',
        slug: 'datetime-fields',
        fields: [createFieldDefinition('timestamp', 'datetime')],
      });

      expect(ct.fields[0]?.type).toBe('datetime');
    });

    it('should support select field with options', async () => {
      const ct = await contentTypeService.create({
        name: 'Select Fields',
        slug: 'select-fields',
        fields: [
          {
            name: 'status',
            type: 'select',
            label: 'Status',
            validation: { options: ['active', 'inactive', 'pending'] },
          },
        ],
      });

      expect(ct.fields[0]?.type).toBe('select');
      expect(ct.fields[0]?.validation?.options).toEqual(['active', 'inactive', 'pending']);
    });

    it('should support relation field', async () => {
      const ct = await contentTypeService.create({
        name: 'Relation Fields',
        slug: 'relation-fields',
        fields: [
          {
            name: 'author',
            type: 'relation',
            label: 'Author',
            relationTo: 'authors',
            relationMultiple: false,
          },
        ],
      });

      expect(ct.fields[0]?.type).toBe('relation');
      expect(ct.fields[0]?.relationTo).toBe('authors');
    });

    it('should support media field', async () => {
      const ct = await contentTypeService.create({
        name: 'Media Fields',
        slug: 'media-fields',
        fields: [
          {
            name: 'image',
            type: 'media',
            label: 'Image',
          },
        ],
      });

      expect(ct.fields[0]?.type).toBe('media');
    });

    it('should support json field', async () => {
      const ct = await contentTypeService.create({
        name: 'JSON Fields',
        slug: 'json-fields',
        fields: [createFieldDefinition('data', 'json')],
      });

      expect(ct.fields[0]?.type).toBe('json');
    });
  });

  // ============================================================================
  // Field Validation Options
  // ============================================================================

  describe('field validation', () => {
    it('should support required field', async () => {
      const ct = await contentTypeService.create({
        name: 'Required Fields',
        slug: 'required-fields',
        fields: [
          {
            name: 'title',
            type: 'text',
            label: 'Title',
            required: true,
          },
        ],
      });

      expect(ct.fields[0]?.required).toBe(true);
    });

    it('should support min/max validation for text', async () => {
      const ct = await contentTypeService.create({
        name: 'MinMax Fields',
        slug: 'minmax-fields',
        fields: [
          {
            name: 'username',
            type: 'text',
            label: 'Username',
            validation: {
              min: 3,
              max: 20,
            },
          },
        ],
      });

      expect(ct.fields[0]?.validation?.min).toBe(3);
      expect(ct.fields[0]?.validation?.max).toBe(20);
    });

    it('should support pattern validation', async () => {
      const ct = await contentTypeService.create({
        name: 'Pattern Fields',
        slug: 'pattern-fields',
        fields: [
          {
            name: 'email',
            type: 'text',
            label: 'Email',
            validation: {
              pattern: '^[^@]+@[^@]+\\.[^@]+$',
            },
          },
        ],
      });

      expect(ct.fields[0]?.validation?.pattern).toBe('^[^@]+@[^@]+\\.[^@]+$');
    });

    it('should support default value', async () => {
      const ct = await contentTypeService.create({
        name: 'Default Fields',
        slug: 'default-fields',
        fields: [
          {
            name: 'status',
            type: 'text',
            label: 'Status',
            defaultValue: 'draft',
          },
        ],
      });

      expect(ct.fields[0]?.defaultValue).toBe('draft');
    });

    it('should support field description', async () => {
      const ct = await contentTypeService.create({
        name: 'Description Fields',
        slug: 'description-fields',
        fields: [
          {
            name: 'internalId',
            type: 'text',
            label: 'Internal ID',
            description: 'An internal identifier for the item',
          },
        ],
      });

      expect(ct.fields[0]?.description).toBe('An internal identifier for the item');
    });
  });
});
