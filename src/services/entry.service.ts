/**
 * Entry Service
 * Business logic for entry management
 */

import { nanoid } from 'nanoid';
import {
  getEntriesCollection,
  getContentTypesCollection,
  getTermsCollection,
} from '../db/index.js';
import { hookSystem } from '../plugins/index.js';
import type {
  Entry,
  CreateEntryInput,
  UpdateEntryInput,
  EntryFilters,
  EntrySort,
  EntryPagination,
  PaginatedEntries,
  ContentType,
} from '../models/index.js';
import {
  CreateEntrySchema,
  UpdateEntrySchema,
  generateSlug,
  validateContentAgainstType,
} from '../models/index.js';
import type { Doc, Query } from '../lib/lokijs/index.js';

export class EntryService {
  // Create a new entry
  async create(input: CreateEntryInput, authorId: string, authorName?: string): Promise<Entry> {
    // Execute beforeCreate hook
    const hookPayload = await hookSystem.execute('entry:beforeCreate', { input, authorId });
    const modifiedInput = hookPayload.input as CreateEntryInput;

    const validated = CreateEntrySchema.parse(modifiedInput);
    const collection = getEntriesCollection();
    const contentTypesCollection = getContentTypesCollection();

    // Resolve content type
    let contentType: Doc<ContentType> | null = null;
    if (validated.contentTypeId) {
      contentType = contentTypesCollection.findOne({ id: validated.contentTypeId });
    } else if (validated.contentTypeSlug) {
      contentType = contentTypesCollection.findOne({ slug: validated.contentTypeSlug });
    }

    if (!contentType) {
      throw new Error('Content type not found');
    }

    // Validate content against content type fields
    const validation = validateContentAgainstType(validated.content, contentType);
    if (!validation.valid) {
      throw new Error(`Content validation failed: ${validation.errors.join(', ')}`);
    }

    // Generate slug if not provided
    const slug = validated.slug ?? generateSlug(validated.title);

    // Check slug uniqueness within content type
    const existingSlug = collection.findOne({
      contentTypeId: contentType.id,
      slug,
    });
    if (existingSlug) {
      throw new Error(`Entry with slug '${slug}' already exists in this content type`);
    }

    // Validate taxonomy terms exist
    if (validated.taxonomyTerms?.length) {
      await this.validateTerms(validated.taxonomyTerms);
    }

    const now = Date.now();
    const entry: Entry = {
      id: nanoid(),
      contentTypeId: contentType.id,
      contentTypeSlug: contentType.slug,
      title: validated.title,
      slug,
      content: validated.content,
      metadata: validated.metadata ?? {},
      status: validated.status ?? 'draft',
      authorId,
      authorName,
      taxonomyTerms: validated.taxonomyTerms ?? [],
      version: 1,
      locale: validated.locale ?? 'en',
      createdAt: now,
      updatedAt: now,
      publishedAt: validated.status === 'published' ? now : undefined,
      scheduledAt: validated.scheduledAt,
    };

    const doc = collection.insert(entry) as Doc<Entry>;

    // Update term counts
    await this.updateTermCounts([], entry.taxonomyTerms);

    const result = this.toEntry(doc);

    // Execute afterCreate hook
    await hookSystem.execute('entry:afterCreate', { entry: result });

    return result;
  }

  // Find entries with filters and pagination
  async findAll(
    filters?: EntryFilters,
    sort?: EntrySort,
    pagination?: EntryPagination
  ): Promise<PaginatedEntries> {
    const collection = getEntriesCollection();
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;

    // Build query
    const query: Query<Entry> = {};

    if (filters?.contentTypeId) {
      query.contentTypeId = filters.contentTypeId;
    }
    if (filters?.contentTypeSlug) {
      query.contentTypeSlug = filters.contentTypeSlug;
    }
    if (filters?.status) {
      query.status = filters.status;
    }
    if (filters?.authorId) {
      query.authorId = filters.authorId;
    }
    if (filters?.locale) {
      query.locale = filters.locale;
    }

    // Start with base query
    let resultSet = collection.chain().find(query);

    // Apply taxonomy filter
    if (filters?.taxonomyTerms?.length) {
      resultSet = resultSet.where(doc =>
        filters.taxonomyTerms!.some(termId => doc.taxonomyTerms.includes(termId))
      );
    }

    // Apply date filters
    if (filters?.createdAfter) {
      resultSet = resultSet.where(doc => doc.createdAt >= filters.createdAfter!);
    }
    if (filters?.createdBefore) {
      resultSet = resultSet.where(doc => doc.createdAt <= filters.createdBefore!);
    }
    if (filters?.publishedAfter) {
      resultSet = resultSet.where(doc =>
        doc.publishedAt !== undefined && doc.publishedAt >= filters.publishedAfter!
      );
    }
    if (filters?.publishedBefore) {
      resultSet = resultSet.where(doc =>
        doc.publishedAt !== undefined && doc.publishedAt <= filters.publishedBefore!
      );
    }

    // Apply search
    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      resultSet = resultSet.where(doc =>
        doc.title.toLowerCase().includes(searchLower) ||
        doc.slug.toLowerCase().includes(searchLower)
      );
    }

    // Get total count before pagination
    const total = resultSet.count();

    // Apply sorting (default: createdAt desc - newest first)
    const sortField = sort?.field ?? 'createdAt';
    const sortDesc = (sort?.order ?? 'desc') === 'desc';
    resultSet = resultSet.simplesort(sortField as keyof Entry, sortDesc);

    // Apply pagination
    const offset = (page - 1) * limit;
    resultSet = resultSet.offset(offset).limit(limit);

    const entries = resultSet.data().map(doc => this.toEntry(doc));

    return {
      entries,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    };
  }

  // Get entry by ID
  async findById(id: string): Promise<Entry | null> {
    const collection = getEntriesCollection();
    const doc = collection.findOne({ id });
    return doc ? this.toEntry(doc) : null;
  }

  // Get entry by slug and content type
  async findBySlug(slug: string, contentTypeSlug: string): Promise<Entry | null> {
    const collection = getEntriesCollection();
    const doc = collection.findOne({ slug, contentTypeSlug });
    return doc ? this.toEntry(doc) : null;
  }

  // Update entry
  async update(id: string, input: UpdateEntryInput): Promise<Entry> {
    // Execute beforeUpdate hook
    const hookPayload = await hookSystem.execute('entry:beforeUpdate', { id, input });
    const modifiedInput = hookPayload.input as UpdateEntryInput;

    const validated = UpdateEntrySchema.parse(modifiedInput);
    const collection = getEntriesCollection();
    const contentTypesCollection = getContentTypesCollection();

    const doc = collection.findOne({ id });
    if (!doc) {
      throw new Error(`Entry with id '${id}' not found`);
    }

    const previousEntry = this.toEntry(doc);

    // Get content type for validation
    const contentType = contentTypesCollection.findOne({ id: doc.contentTypeId });
    if (!contentType) {
      throw new Error('Content type not found');
    }

    // Validate content if provided
    if (validated.content) {
      const mergedContent = { ...doc.content, ...validated.content };
      const validation = validateContentAgainstType(mergedContent, contentType);
      if (!validation.valid) {
        throw new Error(`Content validation failed: ${validation.errors.join(', ')}`);
      }
    }

    // Check slug uniqueness if changing
    if (validated.slug && validated.slug !== doc.slug) {
      const existingSlug = collection.findOne({
        contentTypeId: doc.contentTypeId,
        slug: validated.slug,
      });
      if (existingSlug && existingSlug.id !== id) {
        throw new Error(`Entry with slug '${validated.slug}' already exists`);
      }
    }

    // Validate taxonomy terms if provided
    if (validated.taxonomyTerms?.length) {
      await this.validateTerms(validated.taxonomyTerms);
    }

    const now = Date.now();
    const oldTerms = doc.taxonomyTerms;

    const updated: Doc<Entry> = {
      ...doc,
      ...validated,
      content: validated.content ? { ...doc.content, ...validated.content } : doc.content,
      metadata: validated.metadata ? { ...doc.metadata, ...validated.metadata } : doc.metadata,
      version: doc.version + 1,
      updatedAt: now,
    };

    // Handle status changes
    if (validated.status === 'published' && doc.status !== 'published') {
      updated.publishedAt = now;
    }

    collection.update(updated);

    // Update term counts if terms changed
    if (validated.taxonomyTerms) {
      await this.updateTermCounts(oldTerms, validated.taxonomyTerms);
    }

    const result = this.toEntry(updated);

    // Execute afterUpdate hook
    await hookSystem.execute('entry:afterUpdate', { entry: result, previousEntry });

    return result;
  }

  // Delete entry
  async delete(id: string): Promise<void> {
    const collection = getEntriesCollection();

    const doc = collection.findOne({ id });
    if (!doc) {
      throw new Error(`Entry with id '${id}' not found`);
    }

    const entry = this.toEntry(doc);

    // Execute beforeDelete hook
    await hookSystem.execute('entry:beforeDelete', { id, entry });

    collection.remove(doc);

    // Update term counts
    await this.updateTermCounts(doc.taxonomyTerms, []);

    // Execute afterDelete hook
    await hookSystem.execute('entry:afterDelete', { id });
  }

  // Publish entry
  async publish(id: string): Promise<Entry> {
    const collection = getEntriesCollection();
    const doc = collection.findOne({ id });
    if (!doc) {
      throw new Error(`Entry with id '${id}' not found`);
    }

    const entry = this.toEntry(doc);

    // Execute beforePublish hook
    await hookSystem.execute('entry:beforePublish', { id, entry });

    const result = await this.update(id, { status: 'published' });

    // Execute afterPublish hook
    await hookSystem.execute('entry:afterPublish', { entry: result });

    return result;
  }

  // Unpublish entry
  async unpublish(id: string): Promise<Entry> {
    const collection = getEntriesCollection();
    const doc = collection.findOne({ id });
    if (!doc) {
      throw new Error(`Entry with id '${id}' not found`);
    }

    const entry = this.toEntry(doc);

    // Execute beforeUnpublish hook
    await hookSystem.execute('entry:beforeUnpublish', { id, entry });

    const result = await this.update(id, { status: 'draft' });

    // Execute afterUnpublish hook
    await hookSystem.execute('entry:afterUnpublish', { entry: result });

    return result;
  }

  // Archive entry
  async archive(id: string): Promise<Entry> {
    return this.update(id, { status: 'archived' });
  }

  // Assign terms to entry
  async assignTerms(id: string, termIds: string[]): Promise<Entry> {
    return this.update(id, { taxonomyTerms: termIds });
  }

  // Get entries by term
  async findByTerm(termId: string, pagination?: EntryPagination): Promise<PaginatedEntries> {
    return this.findAll({ taxonomyTerms: [termId] }, undefined, pagination);
  }

  // Validate that all term IDs exist
  private async validateTerms(termIds: string[]): Promise<void> {
    const termsCollection = getTermsCollection();
    for (const termId of termIds) {
      const term = termsCollection.findOne({ id: termId });
      if (!term) {
        throw new Error(`Term with id '${termId}' not found`);
      }
    }
  }

  // Update term counts when entries change
  private async updateTermCounts(oldTermIds: string[], newTermIds: string[]): Promise<void> {
    const termsCollection = getTermsCollection();

    // Decrement old terms
    for (const termId of oldTermIds) {
      if (!newTermIds.includes(termId)) {
        const term = termsCollection.findOne({ id: termId });
        if (term) {
          term.count = Math.max(0, term.count - 1);
          termsCollection.update(term);
        }
      }
    }

    // Increment new terms
    for (const termId of newTermIds) {
      if (!oldTermIds.includes(termId)) {
        const term = termsCollection.findOne({ id: termId });
        if (term) {
          term.count = term.count + 1;
          termsCollection.update(term);
        }
      }
    }
  }

  // Convert Doc to Entry
  private toEntry(doc: Doc<Entry>): Entry {
    const { $loki, meta, ...entry } = doc;
    return entry;
  }
}

// Singleton instance
export const entryService = new EntryService();
