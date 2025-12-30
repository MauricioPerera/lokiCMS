/**
 * Media Routes
 * File upload and media management
 */

import { Hono } from 'hono';
import { mediaService } from '../../services/media.service.js';
import { auth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/roles.js';
import { existsSync, readFileSync } from 'fs';

const mediaRoutes = new Hono();

/**
 * List media items
 * GET /api/media
 */
mediaRoutes.get('/', auth, async (c) => {
  try {
    const query = c.req.query();
    const folder = query['folder'];
    const mimeType = query['type'] || query['mimeType'];
    const limit = query['limit'] ? parseInt(query['limit']) : 50;
    const offset = query['offset'] ? parseInt(query['offset']) : 0;

    const result = await mediaService.list({
      folder,
      mimeType,
      limit: Math.min(limit, 100),
      offset,
    });

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list media';
    return c.json({ error: message }, 500);
  }
});

/**
 * Get media statistics
 * GET /api/media/stats
 */
mediaRoutes.get('/stats', auth, async (c) => {
  try {
    const stats = await mediaService.getStats();
    return c.json({
      ...stats,
      totalSizeMB: Math.round(stats.totalSize / 1024 / 1024 * 100) / 100,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get stats';
    return c.json({ error: message }, 500);
  }
});

/**
 * List folders
 * GET /api/media/folders
 */
mediaRoutes.get('/folders', auth, async (c) => {
  try {
    const folders = await mediaService.listFolders();
    return c.json({ folders });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list folders';
    return c.json({ error: message }, 500);
  }
});

/**
 * Get a media item
 * GET /api/media/:id
 */
mediaRoutes.get('/:id', auth, async (c) => {
  try {
    const id = c.req.param('id');
    const item = await mediaService.get(id);

    if (!item) {
      return c.json({ error: 'Media not found' }, 404);
    }

    return c.json({ media: item });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get media';
    return c.json({ error: message }, 500);
  }
});

/**
 * Upload a file
 * POST /api/media
 */
mediaRoutes.post('/', auth, requirePermission('media:upload'), async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    const folder = formData.get('folder') as string | null;
    const alt = formData.get('alt') as string | null;
    const caption = formData.get('caption') as string | null;
    const generateThumbnails = formData.get('thumbnails') !== 'false';

    const buffer = await file.arrayBuffer();

    const media = await mediaService.upload(
      {
        data: new Uint8Array(buffer),
        filename: file.name,
        mimeType: file.type,
      },
      {
        folder: folder || undefined,
        alt: alt || undefined,
        caption: caption || undefined,
        generateThumbnails,
      }
    );

    return c.json({ message: 'File uploaded', media }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return c.json({ error: message }, 500);
  }
});

/**
 * Update media metadata
 * PUT /api/media/:id
 */
mediaRoutes.put('/:id', auth, requirePermission('media:update'), async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();

    const media = await mediaService.update(id, {
      alt: body.alt,
      caption: body.caption,
      metadata: body.metadata,
    });

    return c.json({ message: 'Media updated', media });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Update failed';
    return c.json({ error: message }, 400);
  }
});

/**
 * Delete a media item
 * DELETE /api/media/:id
 */
mediaRoutes.delete('/:id', auth, requirePermission('media:delete'), async (c) => {
  try {
    const id = c.req.param('id');
    await mediaService.delete(id);

    return c.json({ message: 'Media deleted' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Delete failed';
    return c.json({ error: message }, 400);
  }
});

/**
 * Serve a media file
 * GET /api/media/file/:id
 */
mediaRoutes.get('/file/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const item = await mediaService.get(id);

    if (!item) {
      return c.json({ error: 'Media not found' }, 404);
    }

    const filePath = mediaService.getFilePath(item);
    if (!existsSync(filePath)) {
      return c.json({ error: 'File not found' }, 404);
    }

    const fileData = readFileSync(filePath);

    return new Response(fileData, {
      headers: {
        'Content-Type': item.mimeType,
        'Content-Length': item.size.toString(),
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to serve file';
    return c.json({ error: message }, 500);
  }
});

export { mediaRoutes };
