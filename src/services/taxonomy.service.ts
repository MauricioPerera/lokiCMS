/**
 * Taxonomy Service
 * Business logic for taxonomy management
 */

import { nanoid } from 'nanoid';
import { getTaxonomiesCollection, getTermsCollection } from '../db/index.js';
import type {
  Taxonomy,
  CreateTaxonomyInput,
  UpdateTaxonomyInput,
  Term,
  CreateTermInput,
  UpdateTermInput,
  TermTreeNode,
} from '../models/index.js';
import {
  CreateTaxonomySchema,
  UpdateTaxonomySchema,
  CreateTermSchema,
  UpdateTermSchema,
  buildTermTree,
  generateSlug,
} from '../models/index.js';
import type { Doc } from '../lib/lokijs/index.js';

export class TaxonomyService {
  // Create a new taxonomy
  async create(input: CreateTaxonomyInput): Promise<Taxonomy> {
    const validated = CreateTaxonomySchema.parse(input);
    const collection = getTaxonomiesCollection();

    // Check if slug already exists
    const existing = collection.findOne({ slug: validated.slug });
    if (existing) {
      throw new Error(`Taxonomy with slug '${validated.slug}' already exists`);
    }

    const now = Date.now();
    const taxonomy: Taxonomy = {
      id: nanoid(),
      name: validated.name,
      slug: validated.slug,
      description: validated.description,
      hierarchical: validated.hierarchical ?? false,
      allowMultiple: validated.allowMultiple ?? true,
      contentTypes: validated.contentTypes ?? [],
      createdAt: now,
      updatedAt: now,
    };

    const doc = collection.insert(taxonomy) as Doc<Taxonomy>;
    return this.toTaxonomy(doc);
  }

  // Get all taxonomies
  async findAll(): Promise<Taxonomy[]> {
    const collection = getTaxonomiesCollection();
    const docs = collection.find();
    return docs.map(doc => this.toTaxonomy(doc));
  }

  // Get taxonomy by ID
  async findById(id: string): Promise<Taxonomy | null> {
    const collection = getTaxonomiesCollection();
    const doc = collection.findOne({ id });
    return doc ? this.toTaxonomy(doc) : null;
  }

  // Get taxonomy by slug
  async findBySlug(slug: string): Promise<Taxonomy | null> {
    const collection = getTaxonomiesCollection();
    const doc = collection.findOne({ slug });
    return doc ? this.toTaxonomy(doc) : null;
  }

  // Update taxonomy
  async update(id: string, input: UpdateTaxonomyInput): Promise<Taxonomy> {
    const validated = UpdateTaxonomySchema.parse(input);
    const collection = getTaxonomiesCollection();

    const doc = collection.findOne({ id });
    if (!doc) {
      throw new Error(`Taxonomy with id '${id}' not found`);
    }

    // Check slug uniqueness if changing
    if (validated.slug && validated.slug !== doc.slug) {
      const existing = collection.findOne({ slug: validated.slug });
      if (existing && existing.id !== id) {
        throw new Error(`Taxonomy with slug '${validated.slug}' already exists`);
      }

      // Update terms with new taxonomy slug
      const termsCollection = getTermsCollection();
      const terms = termsCollection.find({ taxonomyId: id });
      for (const term of terms) {
        term.taxonomySlug = validated.slug;
        termsCollection.update(term);
      }
    }

    const updated: Doc<Taxonomy> = {
      ...doc,
      ...validated,
      updatedAt: Date.now(),
    };

    collection.update(updated);
    return this.toTaxonomy(updated);
  }

  // Delete taxonomy
  async delete(id: string): Promise<void> {
    const collection = getTaxonomiesCollection();
    const termsCollection = getTermsCollection();

    const doc = collection.findOne({ id });
    if (!doc) {
      throw new Error(`Taxonomy with id '${id}' not found`);
    }

    // Delete all terms in this taxonomy
    const terms = termsCollection.find({ taxonomyId: id });
    for (const term of terms) {
      termsCollection.remove(term);
    }

    collection.remove(doc);
  }

  // Get taxonomies for a content type
  async findByContentType(contentTypeSlug: string): Promise<Taxonomy[]> {
    const collection = getTaxonomiesCollection();
    const docs = collection.chain()
      .where(doc => doc.contentTypes.includes(contentTypeSlug))
      .data();
    return docs.map(doc => this.toTaxonomy(doc));
  }

  // Convert Doc to Taxonomy
  private toTaxonomy(doc: Doc<Taxonomy>): Taxonomy {
    const { $loki, meta, ...taxonomy } = doc;
    return taxonomy;
  }
}

export class TermService {
  // Create a new term
  async create(input: CreateTermInput): Promise<Term> {
    const validated = CreateTermSchema.parse(input);
    const collection = getTermsCollection();
    const taxonomiesCollection = getTaxonomiesCollection();

    // Resolve taxonomy
    let taxonomy: Doc<Taxonomy> | null = null;
    if (validated.taxonomyId) {
      taxonomy = taxonomiesCollection.findOne({ id: validated.taxonomyId });
    } else if (validated.taxonomySlug) {
      taxonomy = taxonomiesCollection.findOne({ slug: validated.taxonomySlug });
    }

    if (!taxonomy) {
      throw new Error('Taxonomy not found');
    }

    // Generate slug if not provided
    const slug = validated.slug ?? generateSlug(validated.name);

    // Check slug uniqueness within taxonomy
    const existing = collection.findOne({
      taxonomyId: taxonomy.id,
      slug,
    });
    if (existing) {
      throw new Error(`Term with slug '${slug}' already exists in this taxonomy`);
    }

    // Validate parent exists if provided
    if (validated.parentId) {
      if (!taxonomy.hierarchical) {
        throw new Error('Cannot set parent on non-hierarchical taxonomy');
      }
      const parent = collection.findOne({ id: validated.parentId, taxonomyId: taxonomy.id });
      if (!parent) {
        throw new Error('Parent term not found');
      }
    }

    const now = Date.now();
    const term: Term = {
      id: nanoid(),
      taxonomyId: taxonomy.id,
      taxonomySlug: taxonomy.slug,
      name: validated.name,
      slug,
      description: validated.description,
      parentId: validated.parentId,
      order: validated.order ?? 0,
      metadata: validated.metadata ?? {},
      count: 0,
      createdAt: now,
      updatedAt: now,
    };

    const doc = collection.insert(term) as Doc<Term>;
    return this.toTerm(doc);
  }

  // Get all terms for a taxonomy
  async findByTaxonomy(taxonomyId: string): Promise<Term[]> {
    const collection = getTermsCollection();
    const docs = collection.chain()
      .find({ taxonomyId })
      .simplesort('order')
      .data();
    return docs.map(doc => this.toTerm(doc));
  }

  // Get all terms for a taxonomy by slug
  async findByTaxonomySlug(taxonomySlug: string): Promise<Term[]> {
    const collection = getTermsCollection();
    const docs = collection.chain()
      .find({ taxonomySlug })
      .simplesort('order')
      .data();
    return docs.map(doc => this.toTerm(doc));
  }

  // Get term tree for hierarchical taxonomy
  async getTermTree(taxonomyId: string): Promise<TermTreeNode[]> {
    const terms = await this.findByTaxonomy(taxonomyId);
    return buildTermTree(terms);
  }

  // Get term by ID
  async findById(id: string): Promise<Term | null> {
    const collection = getTermsCollection();
    const doc = collection.findOne({ id });
    return doc ? this.toTerm(doc) : null;
  }

  // Get term by slug and taxonomy
  async findBySlug(slug: string, taxonomySlug: string): Promise<Term | null> {
    const collection = getTermsCollection();
    const doc = collection.findOne({ slug, taxonomySlug });
    return doc ? this.toTerm(doc) : null;
  }

  // Update term
  async update(id: string, input: UpdateTermInput): Promise<Term> {
    const validated = UpdateTermSchema.parse(input);
    const collection = getTermsCollection();
    const taxonomiesCollection = getTaxonomiesCollection();

    const doc = collection.findOne({ id });
    if (!doc) {
      throw new Error(`Term with id '${id}' not found`);
    }

    // Check slug uniqueness if changing
    if (validated.slug && validated.slug !== doc.slug) {
      const existing = collection.findOne({
        taxonomyId: doc.taxonomyId,
        slug: validated.slug,
      });
      if (existing && existing.id !== id) {
        throw new Error(`Term with slug '${validated.slug}' already exists`);
      }
    }

    // Validate parent if changing
    if (validated.parentId !== undefined) {
      if (validated.parentId === null) {
        // Removing parent is always valid
      } else if (validated.parentId !== doc.parentId) {
        const taxonomy = taxonomiesCollection.findOne({ id: doc.taxonomyId });
        if (taxonomy && !taxonomy.hierarchical) {
          throw new Error('Cannot set parent on non-hierarchical taxonomy');
        }

        // Prevent circular reference
        if (validated.parentId === id) {
          throw new Error('Term cannot be its own parent');
        }

        const parent = collection.findOne({ id: validated.parentId, taxonomyId: doc.taxonomyId });
        if (!parent) {
          throw new Error('Parent term not found');
        }

        // Check for circular reference in ancestors
        let current = parent;
        while (current.parentId) {
          if (current.parentId === id) {
            throw new Error('Circular parent reference detected');
          }
          const nextParent = collection.findOne({ id: current.parentId });
          if (!nextParent) break;
          current = nextParent;
        }
      }
    }

    const updated: Doc<Term> = {
      ...doc,
      ...validated,
      parentId: validated.parentId === null ? undefined : validated.parentId ?? doc.parentId,
      updatedAt: Date.now(),
    };

    collection.update(updated);
    return this.toTerm(updated);
  }

  // Delete term
  async delete(id: string): Promise<void> {
    const collection = getTermsCollection();

    const doc = collection.findOne({ id });
    if (!doc) {
      throw new Error(`Term with id '${id}' not found`);
    }

    // Update children to remove parent reference
    const children = collection.find({ parentId: id });
    for (const child of children) {
      child.parentId = doc.parentId; // Move children up to deleted term's parent
      collection.update(child);
    }

    collection.remove(doc);
  }

  // Get children of a term
  async getChildren(id: string): Promise<Term[]> {
    const collection = getTermsCollection();
    const docs = collection.chain()
      .find({ parentId: id })
      .simplesort('order')
      .data();
    return docs.map(doc => this.toTerm(doc));
  }

  // Reorder terms
  async reorder(termIds: string[]): Promise<void> {
    const collection = getTermsCollection();

    for (let i = 0; i < termIds.length; i++) {
      const termId = termIds[i];
      if (!termId) continue;
      const doc = collection.findOne({ id: termId });
      if (doc) {
        doc.order = i;
        doc.updatedAt = Date.now();
        collection.update(doc);
      }
    }
  }

  // Convert Doc to Term
  private toTerm(doc: Doc<Term>): Term {
    const { $loki, meta, ...term } = doc;
    return term;
  }
}

// Singleton instances
export const taxonomyService = new TaxonomyService();
export const termService = new TermService();
