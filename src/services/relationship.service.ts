/**
 * Relationship Service
 * Content relationships and references between entries
 */

import { nanoid } from 'nanoid';
import { addPluginCollection, getPluginCollection, getEntriesCollection, getContentTypesCollection } from '../db/index.js';
import type { Collection } from '../lib/lokijs/index.js';
import type { Entry } from '../models/index.js';

// Relationship definition (schema)
export interface RelationshipDefinition {
  id: string;
  name: string; // e.g., 'author', 'category', 'related_posts'
  slug: string;
  description?: string;
  sourceContentType: string; // Content type that has the reference
  targetContentType: string; // Content type being referenced
  cardinality: 'one-to-one' | 'one-to-many' | 'many-to-many';
  required: boolean;
  bidirectional: boolean; // Whether to show on both sides
  inverseName?: string; // Name when viewed from target side (e.g., 'posts' for author)
  createdAt: number;
  updatedAt: number;
}

// Actual relationship instance
export interface Relationship {
  id: string;
  definitionId: string;
  sourceId: string; // Entry ID
  targetId: string; // Entry ID
  order?: number; // For ordered relationships
  metadata?: Record<string, unknown>;
  createdAt: number;
}

const DEFINITIONS_COLLECTION = '_relationship_definitions';
const RELATIONSHIPS_COLLECTION = '_relationships';

export class RelationshipService {
  private definitionsCollection: Collection<RelationshipDefinition> | null = null;
  private relationshipsCollection: Collection<Relationship> | null = null;

  /**
   * Initialize the relationship service
   */
  async initialize(): Promise<void> {
    this.definitionsCollection = addPluginCollection<RelationshipDefinition>(DEFINITIONS_COLLECTION, {
      indices: ['slug', 'sourceContentType', 'targetContentType'],
    });

    this.relationshipsCollection = addPluginCollection<Relationship>(RELATIONSHIPS_COLLECTION, {
      indices: ['definitionId', 'sourceId', 'targetId'],
    });

    console.log('[Relationships] Service initialized');
  }

  // ============================================================================
  // Relationship Definition Management
  // ============================================================================

  /**
   * Create a relationship definition
   */
  async createDefinition(input: {
    name: string;
    slug: string;
    description?: string;
    sourceContentType: string;
    targetContentType: string;
    cardinality?: 'one-to-one' | 'one-to-many' | 'many-to-many';
    required?: boolean;
    bidirectional?: boolean;
    inverseName?: string;
  }): Promise<RelationshipDefinition> {
    if (!this.definitionsCollection) {
      this.definitionsCollection = getPluginCollection<RelationshipDefinition>(DEFINITIONS_COLLECTION);
    }

    if (!this.definitionsCollection) {
      throw new Error('Definitions collection not initialized');
    }

    // Check for duplicate slug
    const existing = this.definitionsCollection.findOne({ slug: input.slug });
    if (existing) {
      throw new Error(`Relationship definition with slug '${input.slug}' already exists`);
    }

    // Verify content types exist
    const contentTypesCollection = getContentTypesCollection();
    if (contentTypesCollection) {
      const sourceType = contentTypesCollection.findOne({ slug: input.sourceContentType });
      const targetType = contentTypesCollection.findOne({ slug: input.targetContentType });

      if (!sourceType) {
        throw new Error(`Source content type '${input.sourceContentType}' not found`);
      }
      if (!targetType) {
        throw new Error(`Target content type '${input.targetContentType}' not found`);
      }
    }

    const now = Date.now();
    const definition: RelationshipDefinition = {
      id: nanoid(),
      name: input.name,
      slug: input.slug,
      description: input.description,
      sourceContentType: input.sourceContentType,
      targetContentType: input.targetContentType,
      cardinality: input.cardinality || 'one-to-many',
      required: input.required || false,
      bidirectional: input.bidirectional || false,
      inverseName: input.inverseName,
      createdAt: now,
      updatedAt: now,
    };

    this.definitionsCollection.insert(definition);
    console.log(`[Relationships] Created definition: ${definition.name}`);

    return definition;
  }

  /**
   * Get all relationship definitions
   */
  async getDefinitions(contentType?: string): Promise<RelationshipDefinition[]> {
    if (!this.definitionsCollection) {
      this.definitionsCollection = getPluginCollection<RelationshipDefinition>(DEFINITIONS_COLLECTION);
    }

    if (!this.definitionsCollection) return [];

    if (contentType) {
      // Get definitions where this content type is source or target
      return this.definitionsCollection.find({
        '$or': [
          { sourceContentType: contentType },
          { targetContentType: contentType, bidirectional: true },
        ],
      });
    }

    return this.definitionsCollection.find();
  }

  /**
   * Get a relationship definition by slug
   */
  async getDefinition(slug: string): Promise<RelationshipDefinition | null> {
    if (!this.definitionsCollection) {
      this.definitionsCollection = getPluginCollection<RelationshipDefinition>(DEFINITIONS_COLLECTION);
    }

    return this.definitionsCollection?.findOne({ slug }) || null;
  }

  /**
   * Update a relationship definition
   */
  async updateDefinition(
    slug: string,
    updates: Partial<Omit<RelationshipDefinition, 'id' | 'slug' | 'createdAt' | 'updatedAt'>>
  ): Promise<RelationshipDefinition> {
    if (!this.definitionsCollection) {
      this.definitionsCollection = getPluginCollection<RelationshipDefinition>(DEFINITIONS_COLLECTION);
    }

    if (!this.definitionsCollection) {
      throw new Error('Definitions collection not initialized');
    }

    const definition = this.definitionsCollection.findOne({ slug });
    if (!definition) {
      throw new Error(`Definition '${slug}' not found`);
    }

    Object.assign(definition, updates, { updatedAt: Date.now() });
    this.definitionsCollection.update(definition);

    return definition;
  }

  /**
   * Delete a relationship definition
   */
  async deleteDefinition(slug: string): Promise<void> {
    if (!this.definitionsCollection) {
      this.definitionsCollection = getPluginCollection<RelationshipDefinition>(DEFINITIONS_COLLECTION);
    }

    if (!this.definitionsCollection) {
      throw new Error('Definitions collection not initialized');
    }

    const definition = this.definitionsCollection.findOne({ slug });
    if (!definition) {
      throw new Error(`Definition '${slug}' not found`);
    }

    // Delete all relationships using this definition
    if (this.relationshipsCollection) {
      this.relationshipsCollection.findAndRemove({ definitionId: definition.id });
    }

    this.definitionsCollection.remove(definition);
    console.log(`[Relationships] Deleted definition: ${slug}`);
  }

  // ============================================================================
  // Relationship Instance Management
  // ============================================================================

  /**
   * Create a relationship between two entries
   */
  async link(
    definitionSlug: string,
    sourceId: string,
    targetId: string,
    options?: { order?: number; metadata?: Record<string, unknown> }
  ): Promise<Relationship> {
    if (!this.relationshipsCollection) {
      this.relationshipsCollection = getPluginCollection<Relationship>(RELATIONSHIPS_COLLECTION);
    }

    if (!this.relationshipsCollection) {
      throw new Error('Relationships collection not initialized');
    }

    const definition = await this.getDefinition(definitionSlug);
    if (!definition) {
      throw new Error(`Definition '${definitionSlug}' not found`);
    }

    // Verify entries exist and match content types
    const entriesCollection = getEntriesCollection();
    if (entriesCollection) {
      const source = entriesCollection.findOne({ id: sourceId });
      const target = entriesCollection.findOne({ id: targetId });

      if (!source) {
        throw new Error('Source entry not found');
      }
      if (!target) {
        throw new Error('Target entry not found');
      }

      if (source.contentTypeSlug !== definition.sourceContentType) {
        throw new Error(`Source entry must be of type '${definition.sourceContentType}'`);
      }
      if (target.contentTypeSlug !== definition.targetContentType) {
        throw new Error(`Target entry must be of type '${definition.targetContentType}'`);
      }
    }

    // Check cardinality constraints
    if (definition.cardinality === 'one-to-one') {
      const existing = this.relationshipsCollection.findOne({
        definitionId: definition.id,
        sourceId,
      });
      if (existing) {
        throw new Error('Source already has a relationship of this type');
      }
    }

    // Check for duplicate relationship
    const duplicate = this.relationshipsCollection.findOne({
      definitionId: definition.id,
      sourceId,
      targetId,
    });
    if (duplicate) {
      throw new Error('Relationship already exists');
    }

    const relationship: Relationship = {
      id: nanoid(),
      definitionId: definition.id,
      sourceId,
      targetId,
      order: options?.order,
      metadata: options?.metadata,
      createdAt: Date.now(),
    };

    this.relationshipsCollection.insert(relationship);
    console.log(`[Relationships] Linked: ${sourceId} -> ${targetId} (${definitionSlug})`);

    return relationship;
  }

  /**
   * Remove a relationship
   */
  async unlink(definitionSlug: string, sourceId: string, targetId: string): Promise<void> {
    if (!this.relationshipsCollection) {
      this.relationshipsCollection = getPluginCollection<Relationship>(RELATIONSHIPS_COLLECTION);
    }

    if (!this.relationshipsCollection) {
      throw new Error('Relationships collection not initialized');
    }

    const definition = await this.getDefinition(definitionSlug);
    if (!definition) {
      throw new Error(`Definition '${definitionSlug}' not found`);
    }

    const relationship = this.relationshipsCollection.findOne({
      definitionId: definition.id,
      sourceId,
      targetId,
    });

    if (!relationship) {
      throw new Error('Relationship not found');
    }

    this.relationshipsCollection.remove(relationship);
    console.log(`[Relationships] Unlinked: ${sourceId} -> ${targetId}`);
  }

  /**
   * Get related entries for an entry
   */
  async getRelated(
    entryId: string,
    definitionSlug?: string
  ): Promise<{ definition: RelationshipDefinition; entries: Entry[] }[]> {
    if (!this.relationshipsCollection) {
      this.relationshipsCollection = getPluginCollection<Relationship>(RELATIONSHIPS_COLLECTION);
    }

    if (!this.relationshipsCollection) return [];

    const entriesCollection = getEntriesCollection();
    if (!entriesCollection) return [];

    const results: { definition: RelationshipDefinition; entries: Entry[] }[] = [];

    // Get definitions to check
    let definitions: RelationshipDefinition[];
    if (definitionSlug) {
      const def = await this.getDefinition(definitionSlug);
      definitions = def ? [def] : [];
    } else {
      definitions = await this.getDefinitions();
    }

    for (const definition of definitions) {
      // Get forward relationships (entry is source)
      const forwardRels = this.relationshipsCollection.find({
        definitionId: definition.id,
        sourceId: entryId,
      });

      if (forwardRels.length > 0) {
        const entries: Entry[] = forwardRels
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map((r) => entriesCollection.findOne({ id: r.targetId }))
          .filter((e) => e !== null) as Entry[];

        if (entries.length > 0) {
          results.push({ definition, entries });
        }
      }

      // Get inverse relationships if bidirectional (entry is target)
      if (definition.bidirectional) {
        const inverseRels = this.relationshipsCollection.find({
          definitionId: definition.id,
          targetId: entryId,
        });

        if (inverseRels.length > 0) {
          const entries: Entry[] = inverseRels
            .map((r) => entriesCollection.findOne({ id: r.sourceId }))
            .filter((e) => e !== null) as Entry[];

          if (entries.length > 0) {
            results.push({
              definition: {
                ...definition,
                name: definition.inverseName || `${definition.name} (inverse)`,
              },
              entries,
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Get all relationship data for an entry (for embedding)
   */
  async populateRelationships(entry: Entry): Promise<Record<string, Entry | Entry[] | null>> {
    const related = await this.getRelated(entry.id);
    const result: Record<string, Entry | Entry[] | null> = {};

    for (const { definition, entries } of related) {
      if (definition.cardinality === 'one-to-one') {
        result[definition.slug] = entries[0] || null;
      } else {
        result[definition.slug] = entries;
      }
    }

    return result;
  }

  /**
   * Update relationship order
   */
  async updateOrder(
    definitionSlug: string,
    sourceId: string,
    orderedTargetIds: string[]
  ): Promise<void> {
    if (!this.relationshipsCollection) {
      this.relationshipsCollection = getPluginCollection<Relationship>(RELATIONSHIPS_COLLECTION);
    }

    if (!this.relationshipsCollection) {
      throw new Error('Relationships collection not initialized');
    }

    const definition = await this.getDefinition(definitionSlug);
    if (!definition) {
      throw new Error(`Definition '${definitionSlug}' not found`);
    }

    for (let i = 0; i < orderedTargetIds.length; i++) {
      const rel = this.relationshipsCollection.findOne({
        definitionId: definition.id,
        sourceId,
        targetId: orderedTargetIds[i],
      });

      if (rel) {
        rel.order = i;
        this.relationshipsCollection.update(rel);
      }
    }
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    totalDefinitions: number;
    totalRelationships: number;
    byDefinition: Record<string, number>;
  }> {
    if (!this.definitionsCollection) {
      this.definitionsCollection = getPluginCollection<RelationshipDefinition>(DEFINITIONS_COLLECTION);
    }
    if (!this.relationshipsCollection) {
      this.relationshipsCollection = getPluginCollection<Relationship>(RELATIONSHIPS_COLLECTION);
    }

    const definitions = this.definitionsCollection?.find() || [];
    const relationships = this.relationshipsCollection?.find() || [];

    const byDefinition: Record<string, number> = {};
    for (const def of definitions) {
      byDefinition[def.slug] = relationships.filter((r) => r.definitionId === def.id).length;
    }

    return {
      totalDefinitions: definitions.length,
      totalRelationships: relationships.length,
      byDefinition,
    };
  }
}

// Export singleton instance
export const relationshipService = new RelationshipService();
