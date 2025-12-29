/**
 * Content Type Service
 * Business logic for content type management
 */

import { nanoid } from 'nanoid';
import { getContentTypesCollection, getEntriesCollection } from '../db/index.js';
import { hookSystem } from '../plugins/index.js';
import type {
  ContentType,
  CreateContentTypeInput,
  UpdateContentTypeInput,
} from '../models/index.js';
import { CreateContentTypeSchema, UpdateContentTypeSchema } from '../models/index.js';
import type { Doc } from '../lib/lokijs/index.js';

export class ContentTypeService {
  // Create a new content type
  async create(input: CreateContentTypeInput): Promise<ContentType> {
    // Execute beforeCreate hook
    const hookPayload = await hookSystem.execute('contentType:beforeCreate', { input });
    const modifiedInput = hookPayload.input as CreateContentTypeInput;

    const validated = CreateContentTypeSchema.parse(modifiedInput);
    const collection = getContentTypesCollection();

    // Check if slug already exists
    const existing = collection.findOne({ slug: validated.slug });
    if (existing) {
      throw new Error(`Content type with slug '${validated.slug}' already exists`);
    }

    const now = Date.now();
    const contentType: ContentType = {
      id: nanoid(),
      ...validated,
      fields: validated.fields ?? [],
      titleField: validated.titleField ?? 'title',
      enableVersioning: validated.enableVersioning ?? false,
      enableDrafts: validated.enableDrafts ?? true,
      enableScheduling: validated.enableScheduling ?? false,
      createdAt: now,
      updatedAt: now,
    };

    const doc = collection.insert(contentType) as Doc<ContentType>;
    const result = this.toContentType(doc);

    // Execute afterCreate hook
    await hookSystem.execute('contentType:afterCreate', { contentType: result });

    return result;
  }

  // Get all content types
  async findAll(): Promise<ContentType[]> {
    const collection = getContentTypesCollection();
    const docs = collection.find();
    return docs.map(doc => this.toContentType(doc));
  }

  // Get content type by ID
  async findById(id: string): Promise<ContentType | null> {
    const collection = getContentTypesCollection();
    const doc = collection.findOne({ id });
    return doc ? this.toContentType(doc) : null;
  }

  // Get content type by slug
  async findBySlug(slug: string): Promise<ContentType | null> {
    const collection = getContentTypesCollection();
    const doc = collection.findOne({ slug });
    return doc ? this.toContentType(doc) : null;
  }

  // Update content type
  async update(id: string, input: UpdateContentTypeInput): Promise<ContentType> {
    // Execute beforeUpdate hook
    const hookPayload = await hookSystem.execute('contentType:beforeUpdate', { id, input });
    const modifiedInput = hookPayload.input as UpdateContentTypeInput;

    const validated = UpdateContentTypeSchema.parse(modifiedInput);
    const collection = getContentTypesCollection();

    const doc = collection.findOne({ id });
    if (!doc) {
      throw new Error(`Content type with id '${id}' not found`);
    }

    const previousContentType = this.toContentType(doc);

    // Check slug uniqueness if changing
    if (validated.slug && validated.slug !== doc.slug) {
      const existing = collection.findOne({ slug: validated.slug });
      if (existing && existing.id !== id) {
        throw new Error(`Content type with slug '${validated.slug}' already exists`);
      }
    }

    // Update fields
    const updated: Doc<ContentType> = {
      ...doc,
      ...validated,
      updatedAt: Date.now(),
    };

    collection.update(updated);
    const result = this.toContentType(updated);

    // Execute afterUpdate hook
    await hookSystem.execute('contentType:afterUpdate', { contentType: result, previousContentType });

    return result;
  }

  // Delete content type
  async delete(id: string): Promise<void> {
    const collection = getContentTypesCollection();
    const entriesCollection = getEntriesCollection();

    const doc = collection.findOne({ id });
    if (!doc) {
      throw new Error(`Content type with id '${id}' not found`);
    }

    // Check if there are entries using this content type
    const entriesCount = entriesCollection.count({ contentTypeId: id });
    if (entriesCount > 0) {
      throw new Error(
        `Cannot delete content type '${doc.name}': ${entriesCount} entries are using it`
      );
    }

    const contentType = this.toContentType(doc);

    // Execute beforeDelete hook
    await hookSystem.execute('contentType:beforeDelete', { id, contentType });

    collection.remove(doc);

    // Execute afterDelete hook
    await hookSystem.execute('contentType:afterDelete', { id });
  }

  // Get entries count for a content type
  async getEntriesCount(id: string): Promise<number> {
    const entriesCollection = getEntriesCollection();
    return entriesCollection.count({ contentTypeId: id });
  }

  // Add field to content type
  async addField(
    id: string,
    field: ContentType['fields'][number]
  ): Promise<ContentType> {
    const collection = getContentTypesCollection();

    const doc = collection.findOne({ id });
    if (!doc) {
      throw new Error(`Content type with id '${id}' not found`);
    }

    // Check if field name already exists
    if (doc.fields.some(f => f.name === field.name)) {
      throw new Error(`Field '${field.name}' already exists in content type`);
    }

    const updated: Doc<ContentType> = {
      ...doc,
      fields: [...doc.fields, field],
      updatedAt: Date.now(),
    };

    collection.update(updated);
    return this.toContentType(updated);
  }

  // Remove field from content type
  async removeField(id: string, fieldName: string): Promise<ContentType> {
    const collection = getContentTypesCollection();

    const doc = collection.findOne({ id });
    if (!doc) {
      throw new Error(`Content type with id '${id}' not found`);
    }

    const updated: Doc<ContentType> = {
      ...doc,
      fields: doc.fields.filter(f => f.name !== fieldName),
      updatedAt: Date.now(),
    };

    collection.update(updated);
    return this.toContentType(updated);
  }

  // Update field in content type
  async updateField(
    id: string,
    fieldName: string,
    updates: Partial<ContentType['fields'][number]>
  ): Promise<ContentType> {
    const collection = getContentTypesCollection();

    const doc = collection.findOne({ id });
    if (!doc) {
      throw new Error(`Content type with id '${id}' not found`);
    }

    const fieldIndex = doc.fields.findIndex(f => f.name === fieldName);
    if (fieldIndex === -1) {
      throw new Error(`Field '${fieldName}' not found in content type`);
    }

    const updatedFields = [...doc.fields];
    updatedFields[fieldIndex] = { ...updatedFields[fieldIndex]!, ...updates };

    const updated: Doc<ContentType> = {
      ...doc,
      fields: updatedFields,
      updatedAt: Date.now(),
    };

    collection.update(updated);
    return this.toContentType(updated);
  }

  // Convert Doc to ContentType (remove LokiJS metadata)
  private toContentType(doc: Doc<ContentType>): ContentType {
    const { $loki, meta, ...contentType } = doc;
    return contentType;
  }
}

// Singleton instance
export const contentTypeService = new ContentTypeService();
