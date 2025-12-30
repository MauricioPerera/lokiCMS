/**
 * Backup Routes
 * Export and import CMS data
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { backupService } from '../../services/backup.service.js';
import { auth, requireSession } from '../middleware/auth.js';
import { requirePermission } from '../middleware/roles.js';

const backupRoutes = new Hono();

/**
 * List all backups
 * GET /api/backup
 */
backupRoutes.get('/', auth, requirePermission('system:admin'), async (c) => {
  try {
    const backups = backupService.listBackups();
    const stats = backupService.getStats();

    return c.json({
      backups,
      stats,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list backups';
    return c.json({ error: message }, 500);
  }
});

/**
 * Create a new backup
 * POST /api/backup
 */
backupRoutes.post(
  '/',
  auth,
  requirePermission('system:admin'),
  zValidator('json', z.object({
    description: z.string().optional(),
  }).optional()),
  async (c) => {
    try {
      const session = requireSession(c);
      const body = c.req.valid('json') || {};

      const backup = await backupService.createBackup({
        description: body.description,
        userId: session.user.id,
        userName: session.user.name,
      });

      return c.json({
        message: 'Backup created successfully',
        backup: backup.metadata,
      }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create backup';
      return c.json({ error: message }, 500);
    }
  }
);

/**
 * Get a specific backup metadata
 * GET /api/backup/:id
 */
backupRoutes.get('/:id', auth, requirePermission('system:admin'), async (c) => {
  try {
    const id = c.req.param('id');
    const backup = backupService.getBackup(id);

    if (!backup) {
      return c.json({ error: 'Backup not found' }, 404);
    }

    return c.json({
      metadata: backup.metadata,
      preview: {
        contentTypes: backup.data.contentTypes.slice(0, 5),
        entries: backup.data.entries.slice(0, 5),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get backup';
    return c.json({ error: message }, 500);
  }
});

/**
 * Download a backup
 * GET /api/backup/:id/download
 */
backupRoutes.get('/:id/download', auth, requirePermission('system:admin'), async (c) => {
  try {
    const id = c.req.param('id');
    const backup = backupService.getBackup(id);

    if (!backup) {
      return c.json({ error: 'Backup not found' }, 404);
    }

    const json = JSON.stringify(backup, null, 2);

    return new Response(json, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="lokicms-backup-${id}.json"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to download backup';
    return c.json({ error: message }, 500);
  }
});

/**
 * Delete a backup
 * DELETE /api/backup/:id
 */
backupRoutes.delete('/:id', auth, requirePermission('system:admin'), async (c) => {
  try {
    const id = c.req.param('id');
    const deleted = backupService.deleteBackup(id);

    if (!deleted) {
      return c.json({ error: 'Backup not found' }, 404);
    }

    return c.json({ message: 'Backup deleted' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete backup';
    return c.json({ error: message }, 500);
  }
});

/**
 * Restore from a backup
 * POST /api/backup/:id/restore
 */
backupRoutes.post(
  '/:id/restore',
  auth,
  requirePermission('system:admin'),
  zValidator('json', z.object({
    includeUsers: z.boolean().optional(),
    includeEntries: z.boolean().optional(),
    includeContentTypes: z.boolean().optional(),
    includeTaxonomies: z.boolean().optional(),
    mergeMode: z.enum(['replace', 'merge', 'skip']).optional(),
  }).optional()),
  async (c) => {
    try {
      const id = c.req.param('id');
      const options = c.req.valid('json') || {};

      const result = await backupService.restoreFromBackup(id, options);

      return c.json({
        message: 'Restore completed',
        ...result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to restore backup';
      return c.json({ error: message }, 500);
    }
  }
);

/**
 * Import a backup from JSON
 * POST /api/backup/import
 */
backupRoutes.post(
  '/import',
  auth,
  requirePermission('system:admin'),
  async (c) => {
    try {
      const body = await c.req.json();

      if (!body.backup) {
        return c.json({ error: 'Backup data is required' }, 400);
      }

      const options = body.options || {};
      const backupJson = typeof body.backup === 'string'
        ? body.backup
        : JSON.stringify(body.backup);

      const result = await backupService.importBackup(backupJson, options);

      return c.json({
        message: 'Import completed',
        ...result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import backup';
      return c.json({ error: message }, 500);
    }
  }
);

/**
 * Export current data as backup
 * GET /api/backup/export
 */
backupRoutes.get('/export', auth, requirePermission('system:admin'), async (c) => {
  try {
    const json = await backupService.exportBackup();

    return new Response(json, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="lokicms-export-${Date.now()}.json"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to export backup';
    return c.json({ error: message }, 500);
  }
});

export { backupRoutes };
