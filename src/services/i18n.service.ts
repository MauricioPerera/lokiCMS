/**
 * i18n Service
 * Multi-language content support
 */

import { nanoid } from 'nanoid';
import { addPluginCollection, getPluginCollection, getEntriesCollection } from '../db/index.js';
import type { Collection } from '../lib/lokijs/index.js';
import type { Entry } from '../models/index.js';

// Locale configuration
export interface Locale {
  code: string; // e.g., 'en', 'es', 'fr'
  name: string; // e.g., 'English', 'Español'
  nativeName: string; // e.g., 'English', 'Español'
  isDefault: boolean;
  isActive: boolean;
  direction: 'ltr' | 'rtl';
  createdAt: number;
  updatedAt: number;
}

// Translation for an entry
export interface EntryTranslation {
  id: string;
  entryId: string;
  locale: string;
  title: string;
  slug: string;
  content: Record<string, unknown>;
  status: 'draft' | 'published';
  createdAt: number;
  updatedAt: number;
}

// Translation group (links entries across locales)
export interface TranslationGroup {
  id: string;
  entries: Record<string, string>; // locale -> entryId
  createdAt: number;
}

const LOCALES_COLLECTION = '_locales';
const TRANSLATIONS_COLLECTION = '_translations';
const GROUPS_COLLECTION = '_translation_groups';

// Default locales
const DEFAULT_LOCALES: Omit<Locale, 'createdAt' | 'updatedAt'>[] = [
  { code: 'en', name: 'English', nativeName: 'English', isDefault: true, isActive: true, direction: 'ltr' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', isDefault: false, isActive: true, direction: 'ltr' },
];

export class I18nService {
  private localesCollection: Collection<Locale> | null = null;
  private translationsCollection: Collection<EntryTranslation> | null = null;
  private groupsCollection: Collection<TranslationGroup> | null = null;

  /**
   * Initialize the i18n service
   */
  async initialize(): Promise<void> {
    this.localesCollection = addPluginCollection<Locale>(LOCALES_COLLECTION, {
      indices: ['code', 'isDefault', 'isActive'],
    });

    this.translationsCollection = addPluginCollection<EntryTranslation>(TRANSLATIONS_COLLECTION, {
      indices: ['entryId', 'locale', 'status'],
    });

    this.groupsCollection = addPluginCollection<TranslationGroup>(GROUPS_COLLECTION, {
      indices: ['entries'],
    });

    // Seed default locales if empty
    if (this.localesCollection.count() === 0) {
      const now = Date.now();
      for (const locale of DEFAULT_LOCALES) {
        this.localesCollection.insert({
          ...locale,
          createdAt: now,
          updatedAt: now,
        });
      }
      console.log('[i18n] Default locales created');
    }

    console.log('[i18n] Service initialized');
  }

  // ============================================================================
  // Locale Management
  // ============================================================================

  /**
   * Get all locales
   */
  async getLocales(activeOnly = false): Promise<Locale[]> {
    if (!this.localesCollection) {
      this.localesCollection = getPluginCollection<Locale>(LOCALES_COLLECTION);
    }

    if (!this.localesCollection) return [];

    if (activeOnly) {
      return this.localesCollection.find({ isActive: true });
    }

    return this.localesCollection.find();
  }

  /**
   * Get a locale by code
   */
  async getLocale(code: string): Promise<Locale | null> {
    if (!this.localesCollection) {
      this.localesCollection = getPluginCollection<Locale>(LOCALES_COLLECTION);
    }

    return this.localesCollection?.findOne({ code }) || null;
  }

  /**
   * Get the default locale
   */
  async getDefaultLocale(): Promise<Locale | null> {
    if (!this.localesCollection) {
      this.localesCollection = getPluginCollection<Locale>(LOCALES_COLLECTION);
    }

    return this.localesCollection?.findOne({ isDefault: true }) || null;
  }

  /**
   * Add a new locale
   */
  async addLocale(locale: Omit<Locale, 'createdAt' | 'updatedAt'>): Promise<Locale> {
    if (!this.localesCollection) {
      this.localesCollection = getPluginCollection<Locale>(LOCALES_COLLECTION);
    }

    if (!this.localesCollection) {
      throw new Error('Locales collection not initialized');
    }

    // Check if locale already exists
    const existing = this.localesCollection.findOne({ code: locale.code });
    if (existing) {
      throw new Error(`Locale ${locale.code} already exists`);
    }

    // If this is set as default, unset current default
    if (locale.isDefault) {
      const currentDefault = this.localesCollection.findOne({ isDefault: true });
      if (currentDefault) {
        currentDefault.isDefault = false;
        this.localesCollection.update(currentDefault);
      }
    }

    const now = Date.now();
    const newLocale: Locale = {
      ...locale,
      createdAt: now,
      updatedAt: now,
    };

    this.localesCollection.insert(newLocale);
    console.log(`[i18n] Added locale: ${locale.code}`);

    return newLocale;
  }

  /**
   * Update a locale
   */
  async updateLocale(
    code: string,
    updates: Partial<Omit<Locale, 'code' | 'createdAt' | 'updatedAt'>>
  ): Promise<Locale> {
    if (!this.localesCollection) {
      this.localesCollection = getPluginCollection<Locale>(LOCALES_COLLECTION);
    }

    if (!this.localesCollection) {
      throw new Error('Locales collection not initialized');
    }

    const locale = this.localesCollection.findOne({ code });
    if (!locale) {
      throw new Error(`Locale ${code} not found`);
    }

    // If setting as default, unset current default
    if (updates.isDefault && !locale.isDefault) {
      const currentDefault = this.localesCollection.findOne({ isDefault: true });
      if (currentDefault) {
        currentDefault.isDefault = false;
        this.localesCollection.update(currentDefault);
      }
    }

    Object.assign(locale, updates, { updatedAt: Date.now() });
    this.localesCollection.update(locale);

    return locale;
  }

  /**
   * Delete a locale
   */
  async deleteLocale(code: string): Promise<void> {
    if (!this.localesCollection) {
      this.localesCollection = getPluginCollection<Locale>(LOCALES_COLLECTION);
    }

    if (!this.localesCollection) {
      throw new Error('Locales collection not initialized');
    }

    const locale = this.localesCollection.findOne({ code });
    if (!locale) {
      throw new Error(`Locale ${code} not found`);
    }

    if (locale.isDefault) {
      throw new Error('Cannot delete the default locale');
    }

    this.localesCollection.remove(locale);
    console.log(`[i18n] Deleted locale: ${code}`);
  }

  // ============================================================================
  // Entry Translation Management
  // ============================================================================

  /**
   * Create a translation for an entry
   */
  async createTranslation(
    entryId: string,
    locale: string,
    data: {
      title: string;
      slug: string;
      content: Record<string, unknown>;
      status?: 'draft' | 'published';
    }
  ): Promise<EntryTranslation> {
    if (!this.translationsCollection) {
      this.translationsCollection = getPluginCollection<EntryTranslation>(TRANSLATIONS_COLLECTION);
    }

    if (!this.translationsCollection) {
      throw new Error('Translations collection not initialized');
    }

    // Check if translation already exists
    const existing = this.translationsCollection.findOne({ entryId, locale });
    if (existing) {
      throw new Error(`Translation for ${locale} already exists`);
    }

    // Verify locale exists and is active
    const localeConfig = await this.getLocale(locale);
    if (!localeConfig || !localeConfig.isActive) {
      throw new Error(`Locale ${locale} is not available`);
    }

    const now = Date.now();
    const translation: EntryTranslation = {
      id: nanoid(),
      entryId,
      locale,
      title: data.title,
      slug: data.slug,
      content: data.content,
      status: data.status || 'draft',
      createdAt: now,
      updatedAt: now,
    };

    this.translationsCollection.insert(translation);
    console.log(`[i18n] Created translation: ${entryId} -> ${locale}`);

    return translation;
  }

  /**
   * Update a translation
   */
  async updateTranslation(
    entryId: string,
    locale: string,
    data: Partial<Omit<EntryTranslation, 'id' | 'entryId' | 'locale' | 'createdAt' | 'updatedAt'>>
  ): Promise<EntryTranslation> {
    if (!this.translationsCollection) {
      this.translationsCollection = getPluginCollection<EntryTranslation>(TRANSLATIONS_COLLECTION);
    }

    if (!this.translationsCollection) {
      throw new Error('Translations collection not initialized');
    }

    const translation = this.translationsCollection.findOne({ entryId, locale });
    if (!translation) {
      throw new Error(`Translation for ${locale} not found`);
    }

    Object.assign(translation, data, { updatedAt: Date.now() });
    this.translationsCollection.update(translation);

    return translation;
  }

  /**
   * Get translation for an entry
   */
  async getTranslation(entryId: string, locale: string): Promise<EntryTranslation | null> {
    if (!this.translationsCollection) {
      this.translationsCollection = getPluginCollection<EntryTranslation>(TRANSLATIONS_COLLECTION);
    }

    return this.translationsCollection?.findOne({ entryId, locale }) || null;
  }

  /**
   * Get all translations for an entry
   */
  async getEntryTranslations(entryId: string): Promise<EntryTranslation[]> {
    if (!this.translationsCollection) {
      this.translationsCollection = getPluginCollection<EntryTranslation>(TRANSLATIONS_COLLECTION);
    }

    return this.translationsCollection?.find({ entryId }) || [];
  }

  /**
   * Delete a translation
   */
  async deleteTranslation(entryId: string, locale: string): Promise<void> {
    if (!this.translationsCollection) {
      this.translationsCollection = getPluginCollection<EntryTranslation>(TRANSLATIONS_COLLECTION);
    }

    if (!this.translationsCollection) {
      throw new Error('Translations collection not initialized');
    }

    const translation = this.translationsCollection.findOne({ entryId, locale });
    if (!translation) {
      throw new Error(`Translation for ${locale} not found`);
    }

    this.translationsCollection.remove(translation);
  }

  // ============================================================================
  // Translation Groups
  // ============================================================================

  /**
   * Link entries as translations of each other
   */
  async linkTranslations(entries: Record<string, string>): Promise<TranslationGroup> {
    if (!this.groupsCollection) {
      this.groupsCollection = getPluginCollection<TranslationGroup>(GROUPS_COLLECTION);
    }

    if (!this.groupsCollection) {
      throw new Error('Translation groups collection not initialized');
    }

    const group: TranslationGroup = {
      id: nanoid(),
      entries,
      createdAt: Date.now(),
    };

    this.groupsCollection.insert(group);
    console.log(`[i18n] Created translation group with ${Object.keys(entries).length} entries`);

    return group;
  }

  /**
   * Get translation group for an entry
   */
  async getTranslationGroup(entryId: string): Promise<TranslationGroup | null> {
    if (!this.groupsCollection) {
      this.groupsCollection = getPluginCollection<TranslationGroup>(GROUPS_COLLECTION);
    }

    if (!this.groupsCollection) return null;

    // Find group where any locale has this entryId
    const groups = this.groupsCollection.find();
    for (const group of groups) {
      for (const id of Object.values(group.entries)) {
        if (id === entryId) {
          return group;
        }
      }
    }

    return null;
  }

  /**
   * Get linked entries for a given entry
   */
  async getLinkedTranslations(entryId: string): Promise<Record<string, Entry | null>> {
    const group = await this.getTranslationGroup(entryId);
    if (!group) {
      return {};
    }

    const entriesCollection = getEntriesCollection();
    const result: Record<string, Entry | null> = {};

    for (const [locale, id] of Object.entries(group.entries)) {
      if (id !== entryId) {
        result[locale] = entriesCollection?.findOne({ id }) || null;
      }
    }

    return result;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get entries by locale
   */
  async getEntriesByLocale(
    locale: string,
    options: { contentType?: string; status?: string; limit?: number; offset?: number } = {}
  ): Promise<{ entries: Entry[]; total: number }> {
    const entriesCollection = getEntriesCollection();
    if (!entriesCollection) {
      return { entries: [], total: 0 };
    }

    let chain = entriesCollection.chain().find({ locale });

    if (options.contentType) {
      chain = chain.find({ contentTypeSlug: options.contentType });
    }

    if (options.status) {
      chain = chain.find({ status: options.status as 'draft' | 'published' | 'archived' | 'scheduled' });
    }

    const total = chain.count();

    const entries = chain
      .simplesort('createdAt', true)
      .offset(options.offset || 0)
      .limit(options.limit || 50)
      .data();

    return { entries, total };
  }

  /**
   * Get translation completeness for an entry
   */
  async getTranslationStatus(entryId: string): Promise<{
    translated: string[];
    missing: string[];
    percentage: number;
  }> {
    const locales = await this.getLocales(true);
    const translations = await this.getEntryTranslations(entryId);

    const translatedLocales = new Set(translations.map((t) => t.locale));
    const translated: string[] = [];
    const missing: string[] = [];

    for (const locale of locales) {
      if (translatedLocales.has(locale.code)) {
        translated.push(locale.code);
      } else {
        missing.push(locale.code);
      }
    }

    const percentage = locales.length > 0
      ? Math.round((translated.length / locales.length) * 100)
      : 0;

    return { translated, missing, percentage };
  }

  /**
   * Get i18n statistics
   */
  async getStats(): Promise<{
    totalLocales: number;
    activeLocales: number;
    defaultLocale: string | null;
    totalTranslations: number;
    translationGroups: number;
  }> {
    const locales = await this.getLocales();
    const defaultLocale = await this.getDefaultLocale();

    if (!this.translationsCollection) {
      this.translationsCollection = getPluginCollection<EntryTranslation>(TRANSLATIONS_COLLECTION);
    }
    if (!this.groupsCollection) {
      this.groupsCollection = getPluginCollection<TranslationGroup>(GROUPS_COLLECTION);
    }

    return {
      totalLocales: locales.length,
      activeLocales: locales.filter((l) => l.isActive).length,
      defaultLocale: defaultLocale?.code || null,
      totalTranslations: this.translationsCollection?.count() || 0,
      translationGroups: this.groupsCollection?.count() || 0,
    };
  }
}

// Export singleton instance
export const i18nService = new I18nService();
