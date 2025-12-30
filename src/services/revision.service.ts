/**
 * Revision Service
 * Content versioning and revision history
 */

import { nanoid } from 'nanoid';
import { addPluginCollection, getPluginCollection } from '../db/index.js';
import { hookSystem } from '../plugins/index.js';
import type { Collection } from '../lib/lokijs/index.js';
import type { Entry } from '../models/index.js';

// Revision entry interface
export interface Revision {
  id: string;
  entryId: string;
  contentTypeSlug: string;
  version: number;
  title: string;
  slug: string;
  content: Record<string, unknown>;
  status: string;
  authorId?: string;
  authorName?: string;
  changeType: 'create' | 'update' | 'publish' | 'unpublish' | 'restore';
  changeSummary?: string;
  createdAt: number;
}

export interface RevisionDiff {
  field: string;
  before: unknown;
  after: unknown;
}

const COLLECTION_NAME = '_revisions';
const MAX_REVISIONS_PER_ENTRY = 50; // Keep last 50 revisions per entry

export class RevisionService {
  private collection: Collection<Revision> | null = null;

  /**
   * Initialize the revision collection
   */
  async initialize(): Promise<void> {
    this.collection = addPluginCollection<Revision>(COLLECTION_NAME, {
      indices: ['entryId', 'contentTypeSlug', 'version', 'createdAt'],
    });
    console.log('[Revisions] Collection initialized');

    // Register hooks for automatic revision creation
    this.registerHooks();
  }

  /**
   * Register hooks for automatic revision tracking
   */
  private registerHooks(): void {
    const PLUGIN_NAME = '_revisions';

    // Track entry creation
    hookSystem.register('entry:afterCreate', PLUGIN_NAME, async (payload) => {
      const entry = payload.entry as Entry;
      await this.createRevision(entry, 'create', 'Initial version');
      return payload;
    });

    // Track entry updates
    hookSystem.register('entry:afterUpdate', PLUGIN_NAME, async (payload) => {
      const entry = payload.entry as Entry;
      await this.createRevision(entry, 'update');
      return payload;
    });

    // Track publishing
    hookSystem.register('entry:afterPublish', PLUGIN_NAME, async (payload) => {
      const entry = payload.entry as Entry;
      await this.createRevision(entry, 'publish', 'Published');
      return payload;
    });

    // Track unpublishing
    hookSystem.register('entry:afterUnpublish', PLUGIN_NAME, async (payload) => {
      const entry = payload.entry as Entry;
      await this.createRevision(entry, 'unpublish', 'Unpublished');
      return payload;
    });

    console.log('[Revisions] Hooks registered');
  }

  /**
   * Create a new revision for an entry
   */
  async createRevision(
    entry: Entry,
    changeType: Revision['changeType'],
    changeSummary?: string
  ): Promise<Revision> {
    if (!this.collection) {
      this.collection = getPluginCollection<Revision>(COLLECTION_NAME);
    }

    if (!this.collection) {
      throw new Error('Revision collection not initialized');
    }

    // Get current version number
    const lastRevision = this.collection
      .chain()
      .find({ entryId: entry.id })
      .simplesort('version', true)
      .limit(1)
      .data()[0];

    const version = lastRevision ? lastRevision.version + 1 : 1;

    const revision: Revision = {
      id: nanoid(),
      entryId: entry.id,
      contentTypeSlug: entry.contentTypeSlug,
      version,
      title: entry.title,
      slug: entry.slug,
      content: entry.content as Record<string, unknown>,
      status: entry.status,
      authorId: entry.authorId,
      authorName: entry.authorName,
      changeType,
      changeSummary,
      createdAt: Date.now(),
    };

    this.collection.insert(revision);

    // Cleanup old revisions
    this.cleanupOldRevisions(entry.id);

    return revision;
  }

  /**
   * Get all revisions for an entry
   */
  async getRevisions(entryId: string, limit = 20): Promise<Revision[]> {
    if (!this.collection) {
      this.collection = getPluginCollection<Revision>(COLLECTION_NAME);
    }

    if (!this.collection) {
      return [];
    }

    return this.collection
      .chain()
      .find({ entryId })
      .simplesort('version', true)
      .limit(limit)
      .data();
  }

  /**
   * Get a specific revision
   */
  async getRevision(revisionId: string): Promise<Revision | null> {
    if (!this.collection) {
      this.collection = getPluginCollection<Revision>(COLLECTION_NAME);
    }

    if (!this.collection) {
      return null;
    }

    return this.collection.findOne({ id: revisionId });
  }

  /**
   * Get a specific version of an entry
   */
  async getVersion(entryId: string, version: number): Promise<Revision | null> {
    if (!this.collection) {
      this.collection = getPluginCollection<Revision>(COLLECTION_NAME);
    }

    if (!this.collection) {
      return null;
    }

    return this.collection.findOne({ entryId, version });
  }

  /**
   * Compare two revisions and return differences
   */
  async compareRevisions(
    revisionId1: string,
    revisionId2: string
  ): Promise<RevisionDiff[]> {
    const rev1 = await this.getRevision(revisionId1);
    const rev2 = await this.getRevision(revisionId2);

    if (!rev1 || !rev2) {
      throw new Error('One or both revisions not found');
    }

    const diffs: RevisionDiff[] = [];

    // Compare title
    if (rev1.title !== rev2.title) {
      diffs.push({ field: 'title', before: rev1.title, after: rev2.title });
    }

    // Compare slug
    if (rev1.slug !== rev2.slug) {
      diffs.push({ field: 'slug', before: rev1.slug, after: rev2.slug });
    }

    // Compare status
    if (rev1.status !== rev2.status) {
      diffs.push({ field: 'status', before: rev1.status, after: rev2.status });
    }

    // Compare content fields
    const allFields = new Set([
      ...Object.keys(rev1.content || {}),
      ...Object.keys(rev2.content || {}),
    ]);

    for (const field of allFields) {
      const before = rev1.content?.[field];
      const after = rev2.content?.[field];

      if (JSON.stringify(before) !== JSON.stringify(after)) {
        diffs.push({ field: `content.${field}`, before, after });
      }
    }

    return diffs;
  }

  /**
   * Get revision count for an entry
   */
  async getRevisionCount(entryId: string): Promise<number> {
    if (!this.collection) {
      this.collection = getPluginCollection<Revision>(COLLECTION_NAME);
    }

    if (!this.collection) {
      return 0;
    }

    return this.collection.find({ entryId }).length;
  }

  /**
   * Get latest revision for an entry
   */
  async getLatestRevision(entryId: string): Promise<Revision | null> {
    const revisions = await this.getRevisions(entryId, 1);
    return revisions[0] || null;
  }

  /**
   * Cleanup old revisions beyond the limit
   */
  private cleanupOldRevisions(entryId: string): void {
    if (!this.collection) return;

    const revisions = this.collection
      .chain()
      .find({ entryId })
      .simplesort('version', true)
      .data();

    if (revisions.length > MAX_REVISIONS_PER_ENTRY) {
      const toDelete = revisions.slice(MAX_REVISIONS_PER_ENTRY);
      for (const rev of toDelete) {
        this.collection.remove(rev);
      }
      console.log(`[Revisions] Cleaned up ${toDelete.length} old revisions for entry ${entryId}`);
    }
  }

  /**
   * Get revision statistics
   */
  async getStats(): Promise<{
    totalRevisions: number;
    entriesWithRevisions: number;
    revisionsByType: Record<string, number>;
  }> {
    if (!this.collection) {
      this.collection = getPluginCollection<Revision>(COLLECTION_NAME);
    }

    if (!this.collection) {
      return {
        totalRevisions: 0,
        entriesWithRevisions: 0,
        revisionsByType: {},
      };
    }

    const all = this.collection.find();
    const entryIds = new Set(all.map((r) => r.entryId));
    const revisionsByType: Record<string, number> = {};

    for (const rev of all) {
      revisionsByType[rev.changeType] = (revisionsByType[rev.changeType] || 0) + 1;
    }

    return {
      totalRevisions: all.length,
      entriesWithRevisions: entryIds.size,
      revisionsByType,
    };
  }
}

// Export singleton instance
export const revisionService = new RevisionService();
