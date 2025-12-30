/**
 * i18n Routes
 * Multi-language content management
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { i18nService } from '../../services/i18n.service.js';
import { auth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/roles.js';

const i18nRoutes = new Hono();

// Validation schemas
const LocaleSchema = z.object({
  code: z.string().min(2).max(10),
  name: z.string().min(1).max(50),
  nativeName: z.string().min(1).max(50),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  direction: z.enum(['ltr', 'rtl']).optional(),
});

const TranslationSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  content: z.record(z.unknown()),
  status: z.enum(['draft', 'published']).optional(),
});

// ============================================================================
// Locale Routes
// ============================================================================

/**
 * Get all locales
 * GET /api/i18n/locales
 */
i18nRoutes.get('/locales', async (c) => {
  try {
    const activeOnly = c.req.query('active') === 'true';
    const locales = await i18nService.getLocales(activeOnly);
    const defaultLocale = await i18nService.getDefaultLocale();

    return c.json({
      locales,
      default: defaultLocale?.code,
      total: locales.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get locales';
    return c.json({ error: message }, 500);
  }
});

/**
 * Add a new locale
 * POST /api/i18n/locales
 */
i18nRoutes.post(
  '/locales',
  auth,
  requirePermission('system:admin'),
  zValidator('json', LocaleSchema),
  async (c) => {
    try {
      const input = c.req.valid('json');
      const locale = await i18nService.addLocale({
        code: input.code,
        name: input.name,
        nativeName: input.nativeName,
        isDefault: input.isDefault || false,
        isActive: input.isActive !== false,
        direction: input.direction || 'ltr',
      });

      return c.json({ message: 'Locale added', locale }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add locale';
      return c.json({ error: message }, 400);
    }
  }
);

/**
 * Update a locale
 * PUT /api/i18n/locales/:code
 */
i18nRoutes.put(
  '/locales/:code',
  auth,
  requirePermission('system:admin'),
  zValidator('json', LocaleSchema.partial()),
  async (c) => {
    try {
      const code = c.req.param('code');
      const input = c.req.valid('json');

      const locale = await i18nService.updateLocale(code, {
        name: input.name,
        nativeName: input.nativeName,
        isDefault: input.isDefault,
        isActive: input.isActive,
        direction: input.direction,
      });

      return c.json({ message: 'Locale updated', locale });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update locale';
      return c.json({ error: message }, 400);
    }
  }
);

/**
 * Delete a locale
 * DELETE /api/i18n/locales/:code
 */
i18nRoutes.delete('/locales/:code', auth, requirePermission('system:admin'), async (c) => {
  try {
    const code = c.req.param('code');
    await i18nService.deleteLocale(code);

    return c.json({ message: 'Locale deleted' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete locale';
    return c.json({ error: message }, 400);
  }
});

// ============================================================================
// Translation Routes
// ============================================================================

/**
 * Get translations for an entry
 * GET /api/i18n/entries/:entryId/translations
 */
i18nRoutes.get('/entries/:entryId/translations', auth, async (c) => {
  try {
    const entryId = c.req.param('entryId');
    const translations = await i18nService.getEntryTranslations(entryId);
    const status = await i18nService.getTranslationStatus(entryId);

    return c.json({
      translations,
      status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get translations';
    return c.json({ error: message }, 500);
  }
});

/**
 * Get a specific translation
 * GET /api/i18n/entries/:entryId/translations/:locale
 */
i18nRoutes.get('/entries/:entryId/translations/:locale', auth, async (c) => {
  try {
    const entryId = c.req.param('entryId');
    const locale = c.req.param('locale');

    const translation = await i18nService.getTranslation(entryId, locale);
    if (!translation) {
      return c.json({ error: 'Translation not found' }, 404);
    }

    return c.json({ translation });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get translation';
    return c.json({ error: message }, 500);
  }
});

/**
 * Create a translation for an entry
 * POST /api/i18n/entries/:entryId/translations/:locale
 */
i18nRoutes.post(
  '/entries/:entryId/translations/:locale',
  auth,
  requirePermission('content:create'),
  zValidator('json', TranslationSchema),
  async (c) => {
    try {
      const entryId = c.req.param('entryId');
      const locale = c.req.param('locale');
      const input = c.req.valid('json');

      const translation = await i18nService.createTranslation(entryId, locale, {
        title: input.title,
        slug: input.slug,
        content: input.content,
        status: input.status,
      });

      return c.json({ message: 'Translation created', translation }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create translation';
      return c.json({ error: message }, 400);
    }
  }
);

/**
 * Update a translation
 * PUT /api/i18n/entries/:entryId/translations/:locale
 */
i18nRoutes.put(
  '/entries/:entryId/translations/:locale',
  auth,
  requirePermission('content:update'),
  zValidator('json', TranslationSchema.partial()),
  async (c) => {
    try {
      const entryId = c.req.param('entryId');
      const locale = c.req.param('locale');
      const input = c.req.valid('json');

      const translation = await i18nService.updateTranslation(entryId, locale, input);

      return c.json({ message: 'Translation updated', translation });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update translation';
      return c.json({ error: message }, 400);
    }
  }
);

/**
 * Delete a translation
 * DELETE /api/i18n/entries/:entryId/translations/:locale
 */
i18nRoutes.delete(
  '/entries/:entryId/translations/:locale',
  auth,
  requirePermission('content:delete'),
  async (c) => {
    try {
      const entryId = c.req.param('entryId');
      const locale = c.req.param('locale');

      await i18nService.deleteTranslation(entryId, locale);

      return c.json({ message: 'Translation deleted' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete translation';
      return c.json({ error: message }, 400);
    }
  }
);

// ============================================================================
// Translation Group Routes
// ============================================================================

/**
 * Link entries as translations
 * POST /api/i18n/link
 */
i18nRoutes.post(
  '/link',
  auth,
  requirePermission('content:update'),
  zValidator('json', z.object({
    entries: z.record(z.string()), // locale -> entryId
  })),
  async (c) => {
    try {
      const { entries } = c.req.valid('json');
      const group = await i18nService.linkTranslations(entries);

      return c.json({ message: 'Entries linked', group }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to link entries';
      return c.json({ error: message }, 400);
    }
  }
);

/**
 * Get linked translations for an entry
 * GET /api/i18n/entries/:entryId/linked
 */
i18nRoutes.get('/entries/:entryId/linked', auth, async (c) => {
  try {
    const entryId = c.req.param('entryId');
    const linked = await i18nService.getLinkedTranslations(entryId);
    const group = await i18nService.getTranslationGroup(entryId);

    return c.json({
      group: group?.id,
      linked,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get linked translations';
    return c.json({ error: message }, 500);
  }
});

// ============================================================================
// Stats
// ============================================================================

/**
 * Get i18n statistics
 * GET /api/i18n/stats
 */
i18nRoutes.get('/stats', auth, async (c) => {
  try {
    const stats = await i18nService.getStats();
    return c.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get stats';
    return c.json({ error: message }, 500);
  }
});

export { i18nRoutes };
