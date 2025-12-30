/**
 * Search Service
 * Full-text search across entries and content types
 */

import {
  getEntriesCollection,
  getContentTypesCollection,
  getUsersCollection,
} from '../db/index.js';
import type { Entry, ContentType, User } from '../models/index.js';
import type { Doc } from '../lib/lokijs/index.js';

export interface SearchResult {
  type: 'entry' | 'content-type' | 'user';
  id: string;
  title: string;
  excerpt?: string;
  contentType?: string;
  status?: string;
  score: number;
  createdAt: number;
  updatedAt: number;
}

export interface SearchOptions {
  query: string;
  types?: ('entry' | 'content-type' | 'user')[];
  contentTypes?: string[];  // Filter by content type slugs
  status?: string;          // Filter by status (for entries)
  limit?: number;
  offset?: number;
  locale?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  took: number;  // milliseconds
}

/**
 * Calculate relevance score based on matches
 */
function calculateScore(text: string, query: string): number {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const words = lowerQuery.split(/\s+/);

  let score = 0;

  // Exact match bonus
  if (lowerText.includes(lowerQuery)) {
    score += 10;
  }

  // Word matches
  for (const word of words) {
    if (word.length < 2) continue;

    // Title/name starts with word
    if (lowerText.startsWith(word)) {
      score += 5;
    }
    // Contains word
    else if (lowerText.includes(word)) {
      score += 2;
    }
  }

  return score;
}

/**
 * Extract text content from entry for searching
 */
function extractEntryText(entry: Entry): string {
  const parts = [entry.title, entry.slug];

  // Extract text from content fields
  if (entry.content && typeof entry.content === 'object') {
    for (const value of Object.values(entry.content)) {
      if (typeof value === 'string') {
        parts.push(value);
      } else if (Array.isArray(value)) {
        parts.push(...value.filter(v => typeof v === 'string'));
      }
    }
  }

  // Add metadata
  if (entry.metadata && typeof entry.metadata === 'object') {
    for (const value of Object.values(entry.metadata)) {
      if (typeof value === 'string') {
        parts.push(value);
      }
    }
  }

  return parts.join(' ');
}

/**
 * Create excerpt from text
 */
function createExcerpt(text: string, query: string, maxLength = 150): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Find position of query
  const pos = lowerText.indexOf(lowerQuery);

  if (pos === -1) {
    // No match, return start of text
    return text.slice(0, maxLength) + (text.length > maxLength ? '...' : '');
  }

  // Extract context around match
  const start = Math.max(0, pos - 50);
  const end = Math.min(text.length, pos + query.length + 100);

  let excerpt = text.slice(start, end);
  if (start > 0) excerpt = '...' + excerpt;
  if (end < text.length) excerpt = excerpt + '...';

  return excerpt;
}

export class SearchService {
  /**
   * Search across all content
   */
  async search(options: SearchOptions): Promise<SearchResponse> {
    const startTime = performance.now();

    const {
      query,
      types = ['entry', 'content-type', 'user'],
      contentTypes,
      status,
      limit = 20,
      offset = 0,
      locale,
    } = options;

    if (!query || query.trim().length < 2) {
      throw new Error('Search query must be at least 2 characters');
    }

    const results: SearchResult[] = [];

    // Search entries
    if (types.includes('entry')) {
      const entries = this.searchEntries(query, { contentTypes, status, locale });
      results.push(...entries);
    }

    // Search content types
    if (types.includes('content-type')) {
      const contentTypesResults = this.searchContentTypes(query);
      results.push(...contentTypesResults);
    }

    // Search users
    if (types.includes('user')) {
      const users = this.searchUsers(query);
      results.push(...users);
    }

    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score);

    // Paginate
    const total = results.length;
    const paginatedResults = results.slice(offset, offset + limit);

    const took = Math.round(performance.now() - startTime);

    return {
      results: paginatedResults,
      total,
      query,
      took,
    };
  }

  /**
   * Search entries
   */
  private searchEntries(
    query: string,
    filters: { contentTypes?: string[]; status?: string; locale?: string }
  ): SearchResult[] {
    const collection = getEntriesCollection();
    const contentTypesCollection = getContentTypesCollection();

    // Build LokiJS query
    const lokiQuery: Record<string, unknown> = {};

    if (filters.status) {
      lokiQuery['status'] = filters.status;
    }

    if (filters.locale) {
      lokiQuery['locale'] = filters.locale;
    }

    if (filters.contentTypes?.length) {
      lokiQuery['contentTypeSlug'] = { '$in': filters.contentTypes };
    }

    // Get all matching entries
    let entries: Doc<Entry>[];
    if (Object.keys(lokiQuery).length > 0) {
      entries = collection.find(lokiQuery);
    } else {
      entries = collection.find();
    }

    // Filter by text match and calculate scores
    const results: SearchResult[] = [];

    for (const entry of entries) {
      const text = extractEntryText(entry);
      const score = calculateScore(text, query);

      if (score > 0) {
        // Get content type name
        const contentType = contentTypesCollection.findOne({ id: entry.contentTypeId });

        results.push({
          type: 'entry',
          id: entry.id,
          title: entry.title,
          excerpt: createExcerpt(text, query),
          contentType: contentType?.name || entry.contentTypeSlug,
          status: entry.status,
          score,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        });
      }
    }

    return results;
  }

  /**
   * Search content types
   */
  private searchContentTypes(query: string): SearchResult[] {
    const collection = getContentTypesCollection();
    const contentTypes = collection.find();

    const results: SearchResult[] = [];

    for (const ct of contentTypes) {
      const text = `${ct.name} ${ct.slug} ${ct.description || ''}`;
      const score = calculateScore(text, query);

      if (score > 0) {
        results.push({
          type: 'content-type',
          id: ct.id,
          title: ct.name,
          excerpt: ct.description,
          score,
          createdAt: ct.createdAt,
          updatedAt: ct.updatedAt,
        });
      }
    }

    return results;
  }

  /**
   * Search users
   */
  private searchUsers(query: string): SearchResult[] {
    const collection = getUsersCollection();
    const users = collection.find({ isActive: true });

    const results: SearchResult[] = [];

    for (const user of users) {
      const text = `${user.name} ${user.email}`;
      const score = calculateScore(text, query);

      if (score > 0) {
        results.push({
          type: 'user',
          id: user.id,
          title: user.name,
          excerpt: user.email,
          score,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        });
      }
    }

    return results;
  }

  /**
   * Search within a specific content type
   */
  async searchInContentType(
    contentTypeSlug: string,
    query: string,
    options: { status?: string; limit?: number; offset?: number } = {}
  ): Promise<SearchResponse> {
    return this.search({
      query,
      types: ['entry'],
      contentTypes: [contentTypeSlug],
      status: options.status,
      limit: options.limit,
      offset: options.offset,
    });
  }

  /**
   * Get search suggestions based on partial query
   */
  async suggest(query: string, limit = 5): Promise<string[]> {
    if (!query || query.length < 2) {
      return [];
    }

    const entriesCollection = getEntriesCollection();
    const entries = entriesCollection.find({ status: 'published' });

    const suggestions = new Set<string>();
    const lowerQuery = query.toLowerCase();

    for (const entry of entries) {
      // Check title
      if (entry.title.toLowerCase().includes(lowerQuery)) {
        suggestions.add(entry.title);
      }

      // Check content strings
      if (entry.content && typeof entry.content === 'object') {
        for (const value of Object.values(entry.content)) {
          if (typeof value === 'string' && value.toLowerCase().includes(lowerQuery)) {
            // Extract relevant phrase
            const words = value.split(/\s+/);
            for (let i = 0; i < words.length; i++) {
              if (words[i].toLowerCase().includes(lowerQuery)) {
                const phrase = words.slice(Math.max(0, i - 1), i + 3).join(' ');
                if (phrase.length <= 50) {
                  suggestions.add(phrase);
                }
              }
            }
          }
        }
      }

      if (suggestions.size >= limit * 2) break;
    }

    return Array.from(suggestions).slice(0, limit);
  }
}

// Export singleton instance
export const searchService = new SearchService();
