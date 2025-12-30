/**
 * Backup Service
 * Export and import CMS data
 */

import { nanoid } from 'nanoid';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import {
  getContentTypesCollection,
  getEntriesCollection,
  getTaxonomiesCollection,
  getTermsCollection,
  getUsersCollection,
  getPluginCollection,
  saveDatabase
} from '../db/index.js';

// Backup metadata
export interface BackupMetadata {
  id: string;
  version: string;
  createdAt: number;
  createdBy?: string;
  description?: string;
  stats: {
    contentTypes: number;
    entries: number;
    taxonomies: number;
    terms: number;
    users: number;
  };
}

// Full backup structure
export interface Backup {
  metadata: BackupMetadata;
  data: {
    contentTypes: unknown[];
    entries: unknown[];
    taxonomies: unknown[];
    terms: unknown[];
    users: unknown[];
    plugins?: Record<string, unknown[]>;
  };
}

// Restore options
export interface RestoreOptions {
  includeUsers?: boolean;
  includeEntries?: boolean;
  includeContentTypes?: boolean;
  includeTaxonomies?: boolean;
  mergeMode?: 'replace' | 'merge' | 'skip';
}

const BACKUP_DIR = './data/backups';
const MAX_BACKUPS = 10;
const CMS_VERSION = '1.0.0';

export class BackupService {
  /**
   * Create a full backup of the CMS
   */
  async createBackup(options?: {
    description?: string;
    userId?: string;
    userName?: string;
  }): Promise<Backup> {
    // Ensure backup directory exists
    if (!existsSync(BACKUP_DIR)) {
      mkdirSync(BACKUP_DIR, { recursive: true });
    }

    // Save current database state first
    await saveDatabase();

    // Collect all data
    const contentTypes = getContentTypesCollection()?.find() || [];
    const entries = getEntriesCollection()?.find() || [];
    const taxonomies = getTaxonomiesCollection()?.find() || [];
    const terms = getTermsCollection()?.find() || [];
    const users = getUsersCollection()?.find() || [];

    // Remove sensitive data from users
    const sanitizedUsers = users.map((u) => ({
      ...u,
      passwordHash: undefined, // Don't backup password hashes
      apiKeys: undefined,
    }));

    const backup: Backup = {
      metadata: {
        id: nanoid(),
        version: CMS_VERSION,
        createdAt: Date.now(),
        createdBy: options?.userName || options?.userId,
        description: options?.description,
        stats: {
          contentTypes: contentTypes.length,
          entries: entries.length,
          taxonomies: taxonomies.length,
          terms: terms.length,
          users: users.length,
        },
      },
      data: {
        contentTypes: this.cleanLokiMetadata(contentTypes),
        entries: this.cleanLokiMetadata(entries),
        taxonomies: this.cleanLokiMetadata(taxonomies),
        terms: this.cleanLokiMetadata(terms),
        users: this.cleanLokiMetadata(sanitizedUsers),
      },
    };

    // Save backup to file
    const filename = `backup-${backup.metadata.id}-${Date.now()}.json`;
    const filepath = join(BACKUP_DIR, filename);
    writeFileSync(filepath, JSON.stringify(backup, null, 2));

    console.log(`[Backup] Created backup: ${filename}`);

    // Cleanup old backups
    this.cleanupOldBackups();

    return backup;
  }

  /**
   * Remove LokiJS internal metadata from documents
   */
  private cleanLokiMetadata(docs: unknown[]): unknown[] {
    return docs.map((doc) => {
      const cleaned = { ...(doc as Record<string, unknown>) };
      delete cleaned['$loki'];
      delete cleaned['meta'];
      return cleaned;
    });
  }

  /**
   * Export backup as JSON string
   */
  async exportBackup(): Promise<string> {
    const backup = await this.createBackup();
    return JSON.stringify(backup, null, 2);
  }

  /**
   * List available backups
   */
  listBackups(): BackupMetadata[] {
    if (!existsSync(BACKUP_DIR)) {
      return [];
    }

    const files = readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const filepath = join(BACKUP_DIR, f);
        const stats = statSync(filepath);
        try {
          const content = readFileSync(filepath, 'utf-8');
          const backup = JSON.parse(content) as Backup;
          return {
            ...backup.metadata,
            filename: f,
            fileSize: stats.size,
          };
        } catch {
          return null;
        }
      })
      .filter((b): b is BackupMetadata & { filename: string; fileSize: number } => b !== null)
      .sort((a, b) => b.createdAt - a.createdAt);

    return files;
  }

  /**
   * Get a specific backup
   */
  getBackup(backupId: string): Backup | null {
    if (!existsSync(BACKUP_DIR)) {
      return null;
    }

    const files = readdirSync(BACKUP_DIR).filter((f) => f.includes(backupId));
    if (files.length === 0) {
      return null;
    }

    try {
      const content = readFileSync(join(BACKUP_DIR, files[0]), 'utf-8');
      return JSON.parse(content) as Backup;
    } catch {
      return null;
    }
  }

  /**
   * Delete a backup
   */
  deleteBackup(backupId: string): boolean {
    if (!existsSync(BACKUP_DIR)) {
      return false;
    }

    const files = readdirSync(BACKUP_DIR).filter((f) => f.includes(backupId));
    if (files.length === 0) {
      return false;
    }

    unlinkSync(join(BACKUP_DIR, files[0]));
    console.log(`[Backup] Deleted backup: ${files[0]}`);
    return true;
  }

  /**
   * Restore from a backup
   */
  async restore(
    backup: Backup,
    options: RestoreOptions = {}
  ): Promise<{
    restored: {
      contentTypes: number;
      entries: number;
      taxonomies: number;
      terms: number;
      users: number;
    };
    skipped: {
      contentTypes: number;
      entries: number;
      taxonomies: number;
      terms: number;
      users: number;
    };
  }> {
    const {
      includeUsers = false,
      includeEntries = true,
      includeContentTypes = true,
      includeTaxonomies = true,
      mergeMode = 'skip',
    } = options;

    const restored = { contentTypes: 0, entries: 0, taxonomies: 0, terms: 0, users: 0 };
    const skipped = { contentTypes: 0, entries: 0, taxonomies: 0, terms: 0, users: 0 };

    // Restore content types first (entries depend on them)
    if (includeContentTypes && backup.data.contentTypes) {
      const collection = getContentTypesCollection();
      if (collection) {
        for (const item of backup.data.contentTypes) {
          const doc = item as { id: string; slug: string };
          const existing = collection.findOne({ id: doc.id }) || collection.findOne({ slug: doc.slug });

          if (existing) {
            if (mergeMode === 'replace') {
              Object.assign(existing, doc);
              collection.update(existing);
              restored.contentTypes++;
            } else {
              skipped.contentTypes++;
            }
          } else {
            collection.insert(doc as any);
            restored.contentTypes++;
          }
        }
      }
    }

    // Restore taxonomies
    if (includeTaxonomies && backup.data.taxonomies) {
      const collection = getTaxonomiesCollection();
      if (collection) {
        for (const item of backup.data.taxonomies) {
          const doc = item as { id: string; slug: string };
          const existing = collection.findOne({ id: doc.id }) || collection.findOne({ slug: doc.slug });

          if (existing) {
            if (mergeMode === 'replace') {
              Object.assign(existing, doc);
              collection.update(existing);
              restored.taxonomies++;
            } else {
              skipped.taxonomies++;
            }
          } else {
            collection.insert(doc as any);
            restored.taxonomies++;
          }
        }
      }
    }

    // Restore terms
    if (includeTaxonomies && backup.data.terms) {
      const collection = getTermsCollection();
      if (collection) {
        for (const item of backup.data.terms) {
          const doc = item as { id: string; slug: string };
          const existing = collection.findOne({ id: doc.id });

          if (existing) {
            if (mergeMode === 'replace') {
              Object.assign(existing, doc);
              collection.update(existing);
              restored.terms++;
            } else {
              skipped.terms++;
            }
          } else {
            collection.insert(doc as any);
            restored.terms++;
          }
        }
      }
    }

    // Restore entries
    if (includeEntries && backup.data.entries) {
      const collection = getEntriesCollection();
      if (collection) {
        for (const item of backup.data.entries) {
          const doc = item as { id: string; slug: string };
          const existing = collection.findOne({ id: doc.id });

          if (existing) {
            if (mergeMode === 'replace') {
              Object.assign(existing, doc);
              collection.update(existing);
              restored.entries++;
            } else if (mergeMode === 'merge') {
              // Merge: update only non-existing fields
              for (const [key, value] of Object.entries(doc)) {
                if ((existing as any)[key] === undefined) {
                  (existing as any)[key] = value;
                }
              }
              collection.update(existing);
              restored.entries++;
            } else {
              skipped.entries++;
            }
          } else {
            collection.insert(doc as any);
            restored.entries++;
          }
        }
      }
    }

    // Restore users (optional, without passwords)
    if (includeUsers && backup.data.users) {
      const collection = getUsersCollection();
      if (collection) {
        for (const item of backup.data.users) {
          const doc = item as { id: string; email: string };
          const existing = collection.findOne({ id: doc.id }) || collection.findOne({ email: doc.email });

          if (existing) {
            skipped.users++;
          } else {
            // New users need a password reset
            collection.insert({
              ...doc,
              passwordHash: '', // User will need to reset password
              isActive: false, // Disable until password is set
            } as any);
            restored.users++;
          }
        }
      }
    }

    // Save database
    await saveDatabase();

    console.log(`[Backup] Restore completed:`, restored);

    return { restored, skipped };
  }

  /**
   * Restore from a backup ID
   */
  async restoreFromBackup(
    backupId: string,
    options?: RestoreOptions
  ): Promise<ReturnType<typeof this.restore>> {
    const backup = this.getBackup(backupId);
    if (!backup) {
      throw new Error('Backup not found');
    }

    return this.restore(backup, options);
  }

  /**
   * Import from JSON string
   */
  async importBackup(jsonString: string, options?: RestoreOptions): Promise<ReturnType<typeof this.restore>> {
    try {
      const backup = JSON.parse(jsonString) as Backup;

      if (!backup.metadata || !backup.data) {
        throw new Error('Invalid backup format');
      }

      return this.restore(backup, options);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Invalid JSON format');
      }
      throw error;
    }
  }

  /**
   * Cleanup old backups beyond the limit
   */
  private cleanupOldBackups(): void {
    if (!existsSync(BACKUP_DIR)) {
      return;
    }

    const files = readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => ({
        name: f,
        time: statSync(join(BACKUP_DIR, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length > MAX_BACKUPS) {
      const toDelete = files.slice(MAX_BACKUPS);
      for (const file of toDelete) {
        unlinkSync(join(BACKUP_DIR, file.name));
        console.log(`[Backup] Cleaned up old backup: ${file.name}`);
      }
    }
  }

  /**
   * Get backup statistics
   */
  getStats(): {
    totalBackups: number;
    totalSize: number;
    oldestBackup: number | null;
    newestBackup: number | null;
  } {
    const backups = this.listBackups();
    const totalSize = backups.reduce((sum, b) => sum + ((b as any).fileSize || 0), 0);

    return {
      totalBackups: backups.length,
      totalSize,
      oldestBackup: backups.length > 0 ? backups[backups.length - 1].createdAt : null,
      newestBackup: backups.length > 0 ? backups[0].createdAt : null,
    };
  }
}

// Export singleton instance
export const backupService = new BackupService();
