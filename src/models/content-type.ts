/**
 * Content Type Model
 * Defines the structure of content types (like post, page, product)
 */

import { z } from 'zod';

// Field types supported in content types
export const FieldTypeSchema = z.enum([
  'text',
  'textarea',
  'richtext',
  'number',
  'boolean',
  'date',
  'datetime',
  'email',
  'url',
  'slug',
  'select',
  'multiselect',
  'relation',
  'media',
  'json',
]);

export type FieldType = z.infer<typeof FieldTypeSchema>;

// Field definition schema
export const FieldDefinitionSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  label: z.string().min(1).max(128),
  type: FieldTypeSchema,
  required: z.boolean().optional().default(false),
  unique: z.boolean().optional().default(false),
  defaultValue: z.unknown().optional(),
  description: z.string().max(512).optional(),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    options: z.array(z.string()).optional(),
  }).optional(),
  // For relation fields
  relationTo: z.string().optional(),
  relationMultiple: z.boolean().optional(),
});

export type FieldDefinition = z.infer<typeof FieldDefinitionSchema>;

// Content Type schema for validation
export const ContentTypeSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(64),
  slug: z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/),
  description: z.string().max(512).optional(),
  fields: z.array(FieldDefinitionSchema).default([]),
  titleField: z.string().default('title'),
  enableVersioning: z.boolean().default(false),
  enableDrafts: z.boolean().default(true),
  enableScheduling: z.boolean().default(false),
  icon: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type ContentType = z.infer<typeof ContentTypeSchema>;

// Create content type input
export const CreateContentTypeSchema = ContentTypeSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateContentTypeInput = z.infer<typeof CreateContentTypeSchema>;

// Update content type input
export const UpdateContentTypeSchema = CreateContentTypeSchema.partial();

export type UpdateContentTypeInput = z.infer<typeof UpdateContentTypeSchema>;

// Default content types
export const DEFAULT_CONTENT_TYPES: CreateContentTypeInput[] = [
  {
    name: 'Post',
    slug: 'post',
    description: 'Blog posts and articles',
    fields: [
      {
        name: 'title',
        label: 'Title',
        type: 'text',
        required: true,
      },
      {
        name: 'slug',
        label: 'Slug',
        type: 'slug',
        required: true,
        unique: true,
      },
      {
        name: 'excerpt',
        label: 'Excerpt',
        type: 'textarea',
        required: false,
        validation: { max: 300 },
      },
      {
        name: 'content',
        label: 'Content',
        type: 'richtext',
        required: true,
      },
      {
        name: 'featuredImage',
        label: 'Featured Image',
        type: 'media',
        required: false,
      },
    ],
    titleField: 'title',
    enableDrafts: true,
  },
  {
    name: 'Page',
    slug: 'page',
    description: 'Static pages',
    fields: [
      {
        name: 'title',
        label: 'Title',
        type: 'text',
        required: true,
      },
      {
        name: 'slug',
        label: 'Slug',
        type: 'slug',
        required: true,
        unique: true,
      },
      {
        name: 'content',
        label: 'Content',
        type: 'richtext',
        required: true,
      },
      {
        name: 'template',
        label: 'Template',
        type: 'select',
        required: false,
        validation: {
          options: ['default', 'full-width', 'sidebar'],
        },
        defaultValue: 'default',
      },
    ],
    titleField: 'title',
    enableDrafts: true,
  },
];

// Validate content against content type fields
export function validateContentAgainstType(
  content: Record<string, unknown>,
  contentType: ContentType
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const field of contentType.fields) {
    const value = content[field.name];

    // Check required
    if (field.required && (value === undefined || value === null || value === '')) {
      errors.push(`Field '${field.name}' is required`);
      continue;
    }

    // Skip validation if not required and empty
    if (value === undefined || value === null) {
      continue;
    }

    // Type-specific validation
    switch (field.type) {
      case 'text':
      case 'textarea':
      case 'richtext':
      case 'slug':
        if (typeof value !== 'string') {
          errors.push(`Field '${field.name}' must be a string`);
        } else {
          if (field.validation?.min && value.length < field.validation.min) {
            errors.push(`Field '${field.name}' must be at least ${field.validation.min} characters`);
          }
          if (field.validation?.max && value.length > field.validation.max) {
            errors.push(`Field '${field.name}' must be at most ${field.validation.max} characters`);
          }
          if (field.validation?.pattern && !new RegExp(field.validation.pattern).test(value)) {
            errors.push(`Field '${field.name}' does not match required pattern`);
          }
        }
        break;

      case 'number':
        if (typeof value !== 'number') {
          errors.push(`Field '${field.name}' must be a number`);
        } else {
          if (field.validation?.min !== undefined && value < field.validation.min) {
            errors.push(`Field '${field.name}' must be at least ${field.validation.min}`);
          }
          if (field.validation?.max !== undefined && value > field.validation.max) {
            errors.push(`Field '${field.name}' must be at most ${field.validation.max}`);
          }
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`Field '${field.name}' must be a boolean`);
        }
        break;

      case 'date':
      case 'datetime':
        if (typeof value !== 'string' && typeof value !== 'number') {
          errors.push(`Field '${field.name}' must be a date string or timestamp`);
        }
        break;

      case 'email':
        if (typeof value !== 'string' || !z.string().email().safeParse(value).success) {
          errors.push(`Field '${field.name}' must be a valid email`);
        }
        break;

      case 'url':
        if (typeof value !== 'string' || !z.string().url().safeParse(value).success) {
          errors.push(`Field '${field.name}' must be a valid URL`);
        }
        break;

      case 'select':
        if (typeof value !== 'string') {
          errors.push(`Field '${field.name}' must be a string`);
        } else if (field.validation?.options && !field.validation.options.includes(value)) {
          errors.push(`Field '${field.name}' must be one of: ${field.validation.options.join(', ')}`);
        }
        break;

      case 'multiselect':
        if (!Array.isArray(value)) {
          errors.push(`Field '${field.name}' must be an array`);
        } else if (field.validation?.options) {
          const invalidOptions = value.filter(v => !field.validation!.options!.includes(v as string));
          if (invalidOptions.length > 0) {
            errors.push(`Field '${field.name}' contains invalid options: ${invalidOptions.join(', ')}`);
          }
        }
        break;

      case 'relation':
        if (field.relationMultiple) {
          if (!Array.isArray(value)) {
            errors.push(`Field '${field.name}' must be an array of IDs`);
          }
        } else {
          if (typeof value !== 'string' && typeof value !== 'number') {
            errors.push(`Field '${field.name}' must be an ID`);
          }
        }
        break;

      case 'json':
        if (typeof value !== 'object') {
          errors.push(`Field '${field.name}' must be a JSON object`);
        }
        break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
