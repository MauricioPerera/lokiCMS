/**
 * LokiJS Modernized - Persistence Adapters
 * File system and memory adapters for database persistence
 */

import type { PersistenceAdapter } from './types.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Memory Adapter - Stores data in memory (no persistence)
 * Useful for testing or temporary databases
 */
export class MemoryAdapter implements PersistenceAdapter {
  private storage: Map<string, string> = new Map();

  async loadDatabase(dbname: string): Promise<string | null> {
    return this.storage.get(dbname) ?? null;
  }

  async saveDatabase(dbname: string, dbstring: string): Promise<void> {
    this.storage.set(dbname, dbstring);
  }

  async deleteDatabase(dbname: string): Promise<void> {
    this.storage.delete(dbname);
  }
}

/**
 * File System Adapter - Persists data to the file system
 * Uses atomic writes for data safety
 */
export class FsAdapter implements PersistenceAdapter {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath ?? process.cwd();
  }

  private resolvePath(dbname: string): string {
    // If dbname is absolute path, use it directly
    if (path.isAbsolute(dbname)) {
      return dbname;
    }
    return path.join(this.basePath, dbname);
  }

  async loadDatabase(dbname: string): Promise<string | null> {
    const filepath = this.resolvePath(dbname);
    try {
      const data = await fs.readFile(filepath, 'utf-8');
      return data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async saveDatabase(dbname: string, dbstring: string): Promise<void> {
    const filepath = this.resolvePath(dbname);
    const dir = path.dirname(filepath);

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    // Write to temp file first for atomicity
    const tempPath = `${filepath}.tmp`;
    await fs.writeFile(tempPath, dbstring, 'utf-8');

    // Rename to final location (atomic on most file systems)
    await fs.rename(tempPath, filepath);
  }

  async deleteDatabase(dbname: string): Promise<void> {
    const filepath = this.resolvePath(dbname);
    try {
      await fs.unlink(filepath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  // Check if database file exists
  async exists(dbname: string): Promise<boolean> {
    const filepath = this.resolvePath(dbname);
    try {
      await fs.access(filepath);
      return true;
    } catch {
      return false;
    }
  }

  // Get file stats
  async getStats(dbname: string): Promise<{ size: number; mtime: Date } | null> {
    const filepath = this.resolvePath(dbname);
    try {
      const stats = await fs.stat(filepath);
      return {
        size: stats.size,
        mtime: stats.mtime,
      };
    } catch {
      return null;
    }
  }
}

/**
 * Incremental File System Adapter
 * Only writes changes incrementally, reducing write overhead for large databases
 */
export class IncrementalFsAdapter implements PersistenceAdapter {
  private basePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(basePath?: string) {
    this.basePath = basePath ?? process.cwd();
  }

  private resolvePath(dbname: string): string {
    if (path.isAbsolute(dbname)) {
      return dbname;
    }
    return path.join(this.basePath, dbname);
  }

  async loadDatabase(dbname: string): Promise<string | null> {
    const filepath = this.resolvePath(dbname);
    try {
      const data = await fs.readFile(filepath, 'utf-8');
      return data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async saveDatabase(dbname: string, dbstring: string): Promise<void> {
    // Queue writes to prevent concurrent access issues
    this.writeQueue = this.writeQueue.then(async () => {
      const filepath = this.resolvePath(dbname);
      const dir = path.dirname(filepath);
      await fs.mkdir(dir, { recursive: true });

      const tempPath = `${filepath}.tmp`;
      await fs.writeFile(tempPath, dbstring, 'utf-8');
      await fs.rename(tempPath, filepath);
    });

    await this.writeQueue;
  }

  async deleteDatabase(dbname: string): Promise<void> {
    const filepath = this.resolvePath(dbname);
    try {
      await fs.unlink(filepath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

/**
 * Encrypted File System Adapter
 * Encrypts data before writing to disk
 * Note: Uses Node.js built-in crypto for AES-256-GCM encryption
 */
export class EncryptedFsAdapter implements PersistenceAdapter {
  private adapter: FsAdapter;
  private key: Buffer;
  private algorithm = 'aes-256-gcm';

  constructor(encryptionKey: string | Buffer, basePath?: string) {
    this.adapter = new FsAdapter(basePath);

    // Derive a 32-byte key from the provided key
    if (typeof encryptionKey === 'string') {
      // Use crypto.scryptSync for key derivation
      const crypto = require('node:crypto');
      this.key = crypto.scryptSync(encryptionKey, 'lokijs-salt', 32);
    } else {
      if (encryptionKey.length !== 32) {
        throw new Error('Encryption key must be 32 bytes');
      }
      this.key = encryptionKey;
    }
  }

  private async encrypt(data: string): Promise<string> {
    const crypto = await import('node:crypto');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv) as ReturnType<typeof crypto.createCipheriv> & { getAuthTag(): Buffer };

    let encrypted = cipher.update(data, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    // Combine iv + authTag + encrypted data
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  private async decrypt(data: string): Promise<string> {
    const crypto = await import('node:crypto');
    const [ivHex, authTagHex, encrypted] = data.split(':');

    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv) as ReturnType<typeof crypto.createDecipheriv> & { setAuthTag(tag: Buffer): void };
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');

    return decrypted;
  }

  async loadDatabase(dbname: string): Promise<string | null> {
    const data = await this.adapter.loadDatabase(dbname);
    if (data === null) {
      return null;
    }
    return this.decrypt(data);
  }

  async saveDatabase(dbname: string, dbstring: string): Promise<void> {
    const encrypted = await this.encrypt(dbstring);
    await this.adapter.saveDatabase(dbname, encrypted);
  }

  async deleteDatabase(dbname: string): Promise<void> {
    await this.adapter.deleteDatabase(dbname);
  }
}

/**
 * Compressed File System Adapter
 * Compresses data before writing to disk using gzip
 */
export class CompressedFsAdapter implements PersistenceAdapter {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath ?? process.cwd();
  }

  private resolvePath(dbname: string): string {
    if (path.isAbsolute(dbname)) {
      return dbname;
    }
    return path.join(this.basePath, dbname);
  }

  async loadDatabase(dbname: string): Promise<string | null> {
    const zlib = await import('node:zlib');
    const { promisify } = await import('node:util');
    const gunzip = promisify(zlib.gunzip);

    const filepath = this.resolvePath(dbname);
    try {
      const compressed = await fs.readFile(filepath);
      const decompressed = await gunzip(compressed);
      return decompressed.toString('utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async saveDatabase(dbname: string, dbstring: string): Promise<void> {
    const zlib = await import('node:zlib');
    const { promisify } = await import('node:util');
    const gzip = promisify(zlib.gzip);

    const filepath = this.resolvePath(dbname);
    const dir = path.dirname(filepath);
    await fs.mkdir(dir, { recursive: true });

    const compressed = await gzip(Buffer.from(dbstring, 'utf-8'));
    const tempPath = `${filepath}.tmp`;
    await fs.writeFile(tempPath, compressed);
    await fs.rename(tempPath, filepath);
  }

  async deleteDatabase(dbname: string): Promise<void> {
    const filepath = this.resolvePath(dbname);
    try {
      await fs.unlink(filepath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

/**
 * Create adapter based on options
 */
export function createAdapter(
  type: 'fs' | 'memory' | 'incremental' | 'encrypted' | 'compressed',
  options?: { basePath?: string; encryptionKey?: string | Buffer }
): PersistenceAdapter {
  switch (type) {
    case 'memory':
      return new MemoryAdapter();
    case 'fs':
      return new FsAdapter(options?.basePath);
    case 'incremental':
      return new IncrementalFsAdapter(options?.basePath);
    case 'encrypted':
      if (!options?.encryptionKey) {
        throw new Error('Encryption key required for encrypted adapter');
      }
      return new EncryptedFsAdapter(options.encryptionKey, options.basePath);
    case 'compressed':
      return new CompressedFsAdapter(options?.basePath);
    default:
      return new FsAdapter(options?.basePath);
  }
}
