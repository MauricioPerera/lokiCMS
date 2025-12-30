/**
 * Revision Routes
 * Content versioning and revision history API
 */

import { Hono } from 'hono';
import { revisionService } from '../../services/revision.service.js';
import { auth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/roles.js';
import { getEntriesCollection } from '../../db/index.js';

const revisionRoutes = new Hono();

/**
 * Get revisions for an entry
 * GET /api/revisions/:entryId
 */
revisionRoutes.get('/:entryId', auth, async (c) => {
  try {
    const entryId = c.req.param('entryId');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 20;

    const revisions = await revisionService.getRevisions(entryId, Math.min(limit, 50));
    const count = await revisionService.getRevisionCount(entryId);

    return c.json({
      revisions,
      total: count,
      entryId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch revisions';
    return c.json({ error: message }, 500);
  }
});

/**
 * Get a specific revision
 * GET /api/revisions/:entryId/:revisionId
 */
revisionRoutes.get('/:entryId/:revisionId', auth, async (c) => {
  try {
    const revisionId = c.req.param('revisionId');

    const revision = await revisionService.getRevision(revisionId);
    if (!revision) {
      return c.json({ error: 'Revision not found' }, 404);
    }

    return c.json({ revision });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch revision';
    return c.json({ error: message }, 500);
  }
});

/**
 * Get a specific version by number
 * GET /api/revisions/:entryId/version/:version
 */
revisionRoutes.get('/:entryId/version/:version', auth, async (c) => {
  try {
    const entryId = c.req.param('entryId');
    const version = parseInt(c.req.param('version'));

    const revision = await revisionService.getVersion(entryId, version);
    if (!revision) {
      return c.json({ error: 'Version not found' }, 404);
    }

    return c.json({ revision });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch version';
    return c.json({ error: message }, 500);
  }
});

/**
 * Compare two revisions
 * GET /api/revisions/compare?rev1=xxx&rev2=yyy
 */
revisionRoutes.get('/compare', auth, async (c) => {
  try {
    const rev1 = c.req.query('rev1');
    const rev2 = c.req.query('rev2');

    if (!rev1 || !rev2) {
      return c.json({ error: 'Both rev1 and rev2 parameters are required' }, 400);
    }

    const diffs = await revisionService.compareRevisions(rev1, rev2);
    const revision1 = await revisionService.getRevision(rev1);
    const revision2 = await revisionService.getRevision(rev2);

    return c.json({
      revision1: {
        id: revision1?.id,
        version: revision1?.version,
        createdAt: revision1?.createdAt,
      },
      revision2: {
        id: revision2?.id,
        version: revision2?.version,
        createdAt: revision2?.createdAt,
      },
      diffs,
      totalChanges: diffs.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to compare revisions';
    return c.json({ error: message }, 500);
  }
});

/**
 * Restore an entry to a previous revision
 * POST /api/revisions/:entryId/restore/:revisionId
 */
revisionRoutes.post('/:entryId/restore/:revisionId', auth, requirePermission('content:update'), async (c) => {
  try {
    const entryId = c.req.param('entryId');
    const revisionId = c.req.param('revisionId');

    // Get the revision to restore
    const revision = await revisionService.getRevision(revisionId);
    if (!revision) {
      return c.json({ error: 'Revision not found' }, 404);
    }

    if (revision.entryId !== entryId) {
      return c.json({ error: 'Revision does not belong to this entry' }, 400);
    }

    // Get the current entry
    const collection = getEntriesCollection();
    const entry = collection.findOne({ id: entryId });
    if (!entry) {
      return c.json({ error: 'Entry not found' }, 404);
    }

    // Restore the entry content
    entry.title = revision.title;
    entry.slug = revision.slug;
    entry.content = revision.content;
    entry.updatedAt = Date.now();

    collection.update(entry);

    // Create a new revision for the restore action
    await revisionService.createRevision(
      entry,
      'restore',
      `Restored to version ${revision.version}`
    );

    return c.json({
      message: 'Entry restored successfully',
      entry: {
        id: entry.id,
        title: entry.title,
        slug: entry.slug,
        status: entry.status,
      },
      restoredFrom: {
        revisionId: revision.id,
        version: revision.version,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to restore revision';
    return c.json({ error: message }, 500);
  }
});

/**
 * Get revision statistics
 * GET /api/revisions/stats
 */
revisionRoutes.get('/stats', auth, requirePermission('system:admin'), async (c) => {
  try {
    const stats = await revisionService.getStats();
    return c.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch stats';
    return c.json({ error: message }, 500);
  }
});

export { revisionRoutes };
