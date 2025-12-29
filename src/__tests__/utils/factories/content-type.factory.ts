/**
 * Content Type Factory
 * Generate test content type data
 */

import { nanoid } from 'nanoid';
import type {
  ContentType,
  CreateContentTypeInput,
  UpdateContentTypeInput,
  FieldDefinition,
  FieldType,
} from '../../../models/index.js';

let contentTypeCounter = 0;

/**
 * Generate unique slug for tests
 */
export function uniqueContentTypeSlug(): string {
  return `test-type-${nanoid(8)}`.toLowerCase();
}

/**
 * Create a field definition
 */
export function createFieldDefinition(
  name: string,
  type: FieldType,
  overrides: Partial<FieldDefinition> = {}
): FieldDefinition {
  return {
    name,
    label: name.charAt(0).toUpperCase() + name.slice(1),
    type,
    required: false,
    unique: false,
    ...overrides,
  };
}

/**
 * Create common field definitions
 */
export const commonFields = {
  title: () => createFieldDefinition('title', 'text', { required: true }),
  body: () => createFieldDefinition('body', 'richtext', { required: true }),
  excerpt: () => createFieldDefinition('excerpt', 'textarea', { validation: { max: 300 } }),
  slug: () => createFieldDefinition('slug', 'slug', { required: true, unique: true }),
  email: () => createFieldDefinition('email', 'email', { required: true }),
  url: () => createFieldDefinition('url', 'url'),
  number: () => createFieldDefinition('count', 'number', { validation: { min: 0 } }),
  boolean: () => createFieldDefinition('featured', 'boolean'),
  date: () => createFieldDefinition('publishDate', 'date'),
  select: (options: string[]) =>
    createFieldDefinition('status', 'select', { validation: { options } }),
  multiselect: (options: string[]) =>
    createFieldDefinition('tags', 'multiselect', { validation: { options } }),
  relation: (relationTo: string, multiple = false) =>
    createFieldDefinition('related', 'relation', { relationTo, relationMultiple: multiple }),
  json: () => createFieldDefinition('metadata', 'json'),
  media: () => createFieldDefinition('image', 'media'),
};

/**
 * Create content type input for creation
 */
export function createContentTypeInput(
  overrides: Partial<CreateContentTypeInput> = {}
): CreateContentTypeInput {
  contentTypeCounter++;
  return {
    name: `Test Type ${contentTypeCounter}`,
    slug: uniqueContentTypeSlug(),
    description: 'A test content type',
    fields: [commonFields.title(), commonFields.body()],
    titleField: 'title',
    enableVersioning: false,
    enableDrafts: true,
    enableScheduling: false,
    ...overrides,
  };
}

/**
 * Create a full content type document (as stored in DB)
 */
export function createContentType(overrides: Partial<ContentType> = {}): ContentType {
  const now = Date.now();
  contentTypeCounter++;

  return {
    id: nanoid(),
    name: `Test Type ${contentTypeCounter}`,
    slug: uniqueContentTypeSlug(),
    description: 'A test content type',
    fields: [commonFields.title(), commonFields.body()],
    titleField: 'title',
    enableVersioning: false,
    enableDrafts: true,
    enableScheduling: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create post-like content type
 */
export function createPostContentType(overrides: Partial<ContentType> = {}): ContentType {
  return createContentType({
    name: 'Post',
    slug: `post-${nanoid(6)}`,
    fields: [
      commonFields.title(),
      commonFields.slug(),
      commonFields.excerpt(),
      commonFields.body(),
      commonFields.media(),
    ],
    enableDrafts: true,
    ...overrides,
  });
}

/**
 * Create page-like content type
 */
export function createPageContentType(overrides: Partial<ContentType> = {}): ContentType {
  return createContentType({
    name: 'Page',
    slug: `page-${nanoid(6)}`,
    fields: [
      commonFields.title(),
      commonFields.slug(),
      commonFields.body(),
      commonFields.select(['default', 'full-width', 'sidebar']),
    ],
    enableDrafts: true,
    ...overrides,
  });
}

/**
 * Create content type with all field types
 */
export function createContentTypeWithAllFieldTypes(
  overrides: Partial<ContentType> = {}
): ContentType {
  return createContentType({
    name: 'All Fields Type',
    slug: `all-fields-${nanoid(6)}`,
    fields: [
      createFieldDefinition('textField', 'text'),
      createFieldDefinition('textareaField', 'textarea'),
      createFieldDefinition('richtextField', 'richtext'),
      createFieldDefinition('numberField', 'number'),
      createFieldDefinition('booleanField', 'boolean'),
      createFieldDefinition('dateField', 'date'),
      createFieldDefinition('datetimeField', 'datetime'),
      createFieldDefinition('emailField', 'email'),
      createFieldDefinition('urlField', 'url'),
      createFieldDefinition('slugField', 'slug'),
      createFieldDefinition('selectField', 'select', { validation: { options: ['a', 'b', 'c'] } }),
      createFieldDefinition('multiselectField', 'multiselect', {
        validation: { options: ['x', 'y', 'z'] },
      }),
      createFieldDefinition('relationField', 'relation', { relationTo: 'post' }),
      createFieldDefinition('mediaField', 'media'),
      createFieldDefinition('jsonField', 'json'),
    ],
    ...overrides,
  });
}

/**
 * Create update content type input
 */
export function createUpdateContentTypeInput(
  overrides: Partial<UpdateContentTypeInput> = {}
): UpdateContentTypeInput {
  return {
    name: `Updated Type ${nanoid(4)}`,
    ...overrides,
  };
}

/**
 * Reset content type counter (for test isolation)
 */
export function resetContentTypeCounter(): void {
  contentTypeCounter = 0;
}
