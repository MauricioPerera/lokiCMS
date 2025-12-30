/**
 * Media Service
 * Image optimization, thumbnails, and media management
 */

import { nanoid } from 'nanoid';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';
import { addPluginCollection, getPluginCollection } from '../db/index.js';
import type { Collection } from '../lib/lokijs/index.js';

// Media item interface
export interface MediaItem {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  alt?: string;
  caption?: string;
  folder?: string;
  thumbnails?: {
    small?: string;
    medium?: string;
    large?: string;
  };
  metadata?: Record<string, unknown>;
  uploadedBy?: string;
  createdAt: number;
  updatedAt: number;
}

// Upload options
export interface UploadOptions {
  folder?: string;
  alt?: string;
  caption?: string;
  generateThumbnails?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

// Thumbnail sizes
export interface ThumbnailSizes {
  small: { width: number; height: number };
  medium: { width: number; height: number };
  large: { width: number; height: number };
}

const COLLECTION_NAME = '_media';
const UPLOAD_DIR = './data/uploads';
const THUMBNAILS_DIR = './data/uploads/thumbnails';

const DEFAULT_THUMBNAIL_SIZES: ThumbnailSizes = {
  small: { width: 150, height: 150 },
  medium: { width: 400, height: 400 },
  large: { width: 800, height: 800 },
};

// Supported image types for processing
const PROCESSABLE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export class MediaService {
  private collection: Collection<MediaItem> | null = null;
  private thumbnailSizes: ThumbnailSizes = DEFAULT_THUMBNAIL_SIZES;

  /**
   * Initialize the media service
   */
  async initialize(): Promise<void> {
    // Ensure directories exist
    if (!existsSync(UPLOAD_DIR)) {
      mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    if (!existsSync(THUMBNAILS_DIR)) {
      mkdirSync(THUMBNAILS_DIR, { recursive: true });
    }

    this.collection = addPluginCollection<MediaItem>(COLLECTION_NAME, {
      indices: ['filename', 'mimeType', 'folder', 'createdAt'],
    });

    console.log('[Media] Service initialized');
  }

  /**
   * Upload a file
   */
  async upload(
    file: {
      data: Buffer | Uint8Array;
      filename: string;
      mimeType: string;
    },
    options: UploadOptions = {},
    userId?: string
  ): Promise<MediaItem> {
    if (!this.collection) {
      this.collection = getPluginCollection<MediaItem>(COLLECTION_NAME);
    }

    if (!this.collection) {
      throw new Error('Media collection not initialized');
    }

    const id = nanoid();
    const ext = extname(file.filename).toLowerCase();
    const safeFilename = `${id}${ext}`;

    // Determine folder path
    const folder = options.folder || this.getDateFolder();
    const folderPath = join(UPLOAD_DIR, folder);

    if (!existsSync(folderPath)) {
      mkdirSync(folderPath, { recursive: true });
    }

    const filePath = join(folderPath, safeFilename);

    // Write file
    writeFileSync(filePath, file.data);

    // Get image dimensions if applicable
    let width: number | undefined;
    let height: number | undefined;

    if (PROCESSABLE_TYPES.includes(file.mimeType)) {
      const dimensions = await this.getImageDimensions(file.data);
      width = dimensions?.width;
      height = dimensions?.height;
    }

    // Generate thumbnails for images
    let thumbnails: MediaItem['thumbnails'];
    if (options.generateThumbnails !== false && PROCESSABLE_TYPES.includes(file.mimeType)) {
      thumbnails = await this.generateThumbnails(file.data, id, ext, folder);
    }

    const mediaItem: MediaItem = {
      id,
      filename: safeFilename,
      originalName: file.filename,
      mimeType: file.mimeType,
      size: file.data.length,
      width,
      height,
      alt: options.alt,
      caption: options.caption,
      folder,
      thumbnails,
      uploadedBy: userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.collection.insert(mediaItem);
    console.log(`[Media] Uploaded: ${file.filename} -> ${safeFilename}`);

    return mediaItem;
  }

  /**
   * Get date-based folder (YYYY/MM)
   */
  private getDateFolder(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}/${month}`;
  }

  /**
   * Get image dimensions from buffer
   * Simple implementation without external dependencies
   */
  private async getImageDimensions(
    data: Buffer | Uint8Array
  ): Promise<{ width: number; height: number } | null> {
    const buffer = Buffer.from(data);

    // PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }

    // JPEG
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
      let offset = 2;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xFF) break;
        const marker = buffer[offset + 1];
        if (marker === 0xC0 || marker === 0xC2) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }
        const length = buffer.readUInt16BE(offset + 2);
        offset += 2 + length;
      }
    }

    // GIF
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      const width = buffer.readUInt16LE(6);
      const height = buffer.readUInt16LE(8);
      return { width, height };
    }

    // WebP
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
      if (buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        // VP8
        if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38 && buffer[15] === 0x20) {
          const width = buffer.readUInt16LE(26) & 0x3FFF;
          const height = buffer.readUInt16LE(28) & 0x3FFF;
          return { width, height };
        }
      }
    }

    return null;
  }

  /**
   * Generate thumbnails for an image
   * Note: This is a placeholder - full implementation would use sharp or similar
   */
  private async generateThumbnails(
    _data: Buffer | Uint8Array,
    id: string,
    ext: string,
    folder: string
  ): Promise<MediaItem['thumbnails']> {
    // In a full implementation, we would use 'sharp' or similar library
    // For now, we just record the paths where thumbnails would be stored
    const thumbnailFolder = join(THUMBNAILS_DIR, folder);
    if (!existsSync(thumbnailFolder)) {
      mkdirSync(thumbnailFolder, { recursive: true });
    }

    return {
      small: `thumbnails/${folder}/${id}-small${ext}`,
      medium: `thumbnails/${folder}/${id}-medium${ext}`,
      large: `thumbnails/${folder}/${id}-large${ext}`,
    };
  }

  /**
   * Get a media item by ID
   */
  async get(id: string): Promise<MediaItem | null> {
    if (!this.collection) {
      this.collection = getPluginCollection<MediaItem>(COLLECTION_NAME);
    }

    return this.collection?.findOne({ id }) || null;
  }

  /**
   * Get a media item by filename
   */
  async getByFilename(filename: string): Promise<MediaItem | null> {
    if (!this.collection) {
      this.collection = getPluginCollection<MediaItem>(COLLECTION_NAME);
    }

    return this.collection?.findOne({ filename }) || null;
  }

  /**
   * List media items
   */
  async list(options: {
    folder?: string;
    mimeType?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ items: MediaItem[]; total: number }> {
    if (!this.collection) {
      this.collection = getPluginCollection<MediaItem>(COLLECTION_NAME);
    }

    if (!this.collection) {
      return { items: [], total: 0 };
    }

    let chain = this.collection.chain();

    if (options.folder) {
      chain = chain.find({ folder: options.folder });
    }

    if (options.mimeType) {
      if (options.mimeType.endsWith('/*')) {
        const prefix = options.mimeType.slice(0, -1);
        chain = chain.where((item) => item.mimeType.startsWith(prefix));
      } else {
        chain = chain.find({ mimeType: options.mimeType });
      }
    }

    const total = chain.count();

    const items = chain
      .simplesort('createdAt', true)
      .offset(options.offset || 0)
      .limit(options.limit || 50)
      .data();

    return { items, total };
  }

  /**
   * Update media metadata
   */
  async update(
    id: string,
    updates: { alt?: string; caption?: string; metadata?: Record<string, unknown> }
  ): Promise<MediaItem> {
    if (!this.collection) {
      this.collection = getPluginCollection<MediaItem>(COLLECTION_NAME);
    }

    if (!this.collection) {
      throw new Error('Media collection not initialized');
    }

    const item = this.collection.findOne({ id });
    if (!item) {
      throw new Error('Media item not found');
    }

    if (updates.alt !== undefined) item.alt = updates.alt;
    if (updates.caption !== undefined) item.caption = updates.caption;
    if (updates.metadata !== undefined) item.metadata = updates.metadata;
    item.updatedAt = Date.now();

    this.collection.update(item);
    return item;
  }

  /**
   * Delete a media item
   */
  async delete(id: string): Promise<void> {
    if (!this.collection) {
      this.collection = getPluginCollection<MediaItem>(COLLECTION_NAME);
    }

    if (!this.collection) {
      throw new Error('Media collection not initialized');
    }

    const item = this.collection.findOne({ id });
    if (!item) {
      throw new Error('Media item not found');
    }

    // Delete physical file
    const filePath = join(UPLOAD_DIR, item.folder || '', item.filename);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }

    // Delete thumbnails
    if (item.thumbnails) {
      for (const thumb of Object.values(item.thumbnails)) {
        if (thumb) {
          const thumbPath = join(UPLOAD_DIR, thumb);
          if (existsSync(thumbPath)) {
            unlinkSync(thumbPath);
          }
        }
      }
    }

    this.collection.remove(item);
    console.log(`[Media] Deleted: ${item.filename}`);
  }

  /**
   * Get file path for a media item
   */
  getFilePath(item: MediaItem): string {
    return join(UPLOAD_DIR, item.folder || '', item.filename);
  }

  /**
   * Get public URL for a media item
   */
  getPublicUrl(item: MediaItem, baseUrl = ''): string {
    return `${baseUrl}/uploads/${item.folder || ''}/${item.filename}`;
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    byMimeType: Record<string, { count: number; size: number }>;
    byFolder: Record<string, { count: number; size: number }>;
  }> {
    if (!this.collection) {
      this.collection = getPluginCollection<MediaItem>(COLLECTION_NAME);
    }

    const items = this.collection?.find() || [];

    let totalSize = 0;
    const byMimeType: Record<string, { count: number; size: number }> = {};
    const byFolder: Record<string, { count: number; size: number }> = {};

    for (const item of items) {
      totalSize += item.size;

      // Group by mime type
      const type = item.mimeType.split('/')[0] || 'other';
      if (!byMimeType[type]) {
        byMimeType[type] = { count: 0, size: 0 };
      }
      byMimeType[type].count++;
      byMimeType[type].size += item.size;

      // Group by folder
      const folder = item.folder || 'root';
      if (!byFolder[folder]) {
        byFolder[folder] = { count: 0, size: 0 };
      }
      byFolder[folder].count++;
      byFolder[folder].size += item.size;
    }

    return {
      totalFiles: items.length,
      totalSize,
      byMimeType,
      byFolder,
    };
  }

  /**
   * List folders
   */
  async listFolders(): Promise<string[]> {
    if (!this.collection) {
      this.collection = getPluginCollection<MediaItem>(COLLECTION_NAME);
    }

    const items = this.collection?.find() || [];
    const folders = new Set<string>();

    for (const item of items) {
      if (item.folder) {
        folders.add(item.folder);
      }
    }

    return Array.from(folders).sort();
  }
}

// Export singleton instance
export const mediaService = new MediaService();
