/**
 * Vector Search Service
 * Semantic search using Ollama embeddings and LokiJS storage
 */

import { nanoid } from 'nanoid';
import { addPluginCollection, getPluginCollection, getEntriesCollection } from '../db/index.js';
import type { Collection } from '../lib/lokijs/index.js';
import type { Entry } from '../models/index.js';

// Vector entry stored in LokiJS
export interface VectorEntry {
  id: string;
  entryId: string;
  contentTypeSlug: string;
  vector: number[];
  textHash: string; // To detect if re-indexing is needed
  createdAt: number;
  updatedAt: number;
}

// Search result with similarity score
export interface VectorSearchResult {
  entry: Entry;
  similarity: number;
}

// Ollama configuration
interface OllamaConfig {
  baseUrl: string;
  model: string;
  dimensions: number;
}

const VECTORS_COLLECTION = '_vectors';

// Default Ollama configuration
const DEFAULT_CONFIG: OllamaConfig = {
  baseUrl: process.env['OLLAMA_URL'] || 'http://localhost:11434',
  model: process.env['OLLAMA_EMBED_MODEL'] || 'all-minilm',
  dimensions: 384,
};

export class VectorSearchService {
  private collection: Collection<VectorEntry> | null = null;
  private config: OllamaConfig;
  private isAvailable: boolean = false;

  constructor(config?: Partial<OllamaConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the vector search service
   */
  async initialize(): Promise<void> {
    this.collection = addPluginCollection<VectorEntry>(VECTORS_COLLECTION, {
      indices: ['entryId', 'contentTypeSlug', 'textHash'],
    });

    // Check if Ollama is available
    await this.checkOllamaAvailability();

    console.log(`[VectorSearch] Initialized (Ollama: ${this.isAvailable ? 'available' : 'unavailable'})`);
  }

  /**
   * Check if Ollama is running and the model is available
   */
  private async checkOllamaAvailability(): Promise<void> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`);
      if (response.ok) {
        const data = await response.json() as { models: { name: string }[] };
        const hasModel = data.models.some(m => m.name.startsWith(this.config.model));
        this.isAvailable = hasModel;
        if (!hasModel) {
          console.warn(`[VectorSearch] Model '${this.config.model}' not found in Ollama`);
        }
      }
    } catch {
      this.isAvailable = false;
      console.warn('[VectorSearch] Ollama not available');
    }
  }

  /**
   * Get embedding from Ollama
   */
  private async getEmbedding(text: string): Promise<number[] | null> {
    if (!this.isAvailable) {
      await this.checkOllamaAvailability();
      if (!this.isAvailable) return null;
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          prompt: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json() as { embedding: number[] };
      return data.embedding;
    } catch (error) {
      console.error('[VectorSearch] Embedding error:', error);
      return null;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dot / denominator;
  }

  /**
   * Create a simple hash of text for change detection
   */
  private hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Extract searchable text from an entry
   */
  private extractText(entry: Entry): string {
    const parts: string[] = [entry.title];

    if (entry.content) {
      for (const [key, value] of Object.entries(entry.content)) {
        if (typeof value === 'string') {
          parts.push(value);
        } else if (Array.isArray(value)) {
          parts.push(value.filter(v => typeof v === 'string').join(' '));
        }
      }
    }

    return parts.join(' ').slice(0, 8000); // Limit text length
  }

  /**
   * Index a single entry
   */
  async indexEntry(entryId: string): Promise<boolean> {
    if (!this.collection) {
      this.collection = getPluginCollection<VectorEntry>(VECTORS_COLLECTION);
    }
    if (!this.collection) return false;

    const entriesCollection = getEntriesCollection();
    if (!entriesCollection) return false;

    const entry = entriesCollection.findOne({ id: entryId });
    if (!entry) return false;

    const text = this.extractText(entry);
    const textHash = this.hashText(text);

    // Check if already indexed with same content
    const existing = this.collection.findOne({ entryId });
    if (existing && existing.textHash === textHash) {
      return true; // No need to re-index
    }

    // Get embedding
    const vector = await this.getEmbedding(text);
    if (!vector) return false;

    const now = Date.now();

    if (existing) {
      // Update existing
      existing.vector = vector;
      existing.textHash = textHash;
      existing.updatedAt = now;
      this.collection.update(existing);
    } else {
      // Create new
      this.collection.insert({
        id: nanoid(),
        entryId,
        contentTypeSlug: entry.contentTypeSlug,
        vector,
        textHash,
        createdAt: now,
        updatedAt: now,
      });
    }

    return true;
  }

  /**
   * Index all entries (batch operation)
   */
  async indexAll(options?: {
    contentType?: string;
    batchSize?: number;
    onProgress?: (indexed: number, total: number) => void;
  }): Promise<{ indexed: number; failed: number; skipped: number }> {
    const entriesCollection = getEntriesCollection();
    if (!entriesCollection) {
      return { indexed: 0, failed: 0, skipped: 0 };
    }

    let query: Record<string, unknown> = { status: 'published' };
    if (options?.contentType) {
      query.contentTypeSlug = options.contentType;
    }

    const entries = entriesCollection.find(query);
    const total = entries.length;
    let indexed = 0;
    let failed = 0;
    let skipped = 0;

    for (const entry of entries) {
      const success = await this.indexEntry(entry.id);
      if (success) {
        indexed++;
      } else {
        failed++;
      }

      if (options?.onProgress) {
        options.onProgress(indexed + failed + skipped, total);
      }
    }

    console.log(`[VectorSearch] Indexed ${indexed}/${total} entries (${failed} failed)`);
    return { indexed, failed, skipped };
  }

  /**
   * Remove an entry from the index
   */
  async removeEntry(entryId: string): Promise<boolean> {
    if (!this.collection) {
      this.collection = getPluginCollection<VectorEntry>(VECTORS_COLLECTION);
    }
    if (!this.collection) return false;

    const existing = this.collection.findOne({ entryId });
    if (existing) {
      this.collection.remove(existing);
      return true;
    }
    return false;
  }

  /**
   * Semantic search
   */
  async search(
    query: string,
    options?: {
      limit?: number;
      contentType?: string;
      minSimilarity?: number;
    }
  ): Promise<VectorSearchResult[]> {
    if (!this.collection) {
      this.collection = getPluginCollection<VectorEntry>(VECTORS_COLLECTION);
    }
    if (!this.collection) return [];

    const entriesCollection = getEntriesCollection();
    if (!entriesCollection) return [];

    // Get query embedding
    const queryVector = await this.getEmbedding(query);
    if (!queryVector) return [];

    // Get all vectors (filtered by content type if specified)
    let vectors: VectorEntry[];
    if (options?.contentType) {
      vectors = this.collection.find({ contentTypeSlug: options.contentType });
    } else {
      vectors = this.collection.find();
    }

    const limit = options?.limit || 10;
    const minSimilarity = options?.minSimilarity || 0.3;

    // Calculate similarities
    const results: { entryId: string; similarity: number }[] = [];
    for (const vec of vectors) {
      const similarity = this.cosineSimilarity(queryVector, vec.vector);
      if (similarity >= minSimilarity) {
        results.push({ entryId: vec.entryId, similarity });
      }
    }

    // Sort by similarity (descending) and limit
    results.sort((a, b) => b.similarity - a.similarity);
    const topResults = results.slice(0, limit);

    // Fetch entries
    const searchResults: VectorSearchResult[] = [];
    for (const result of topResults) {
      const entry = entriesCollection.findOne({ id: result.entryId });
      if (entry && entry.status === 'published') {
        searchResults.push({
          entry: entry as Entry,
          similarity: Math.round(result.similarity * 1000) / 1000,
        });
      }
    }

    return searchResults;
  }

  /**
   * Hybrid search: combines keyword and semantic search
   */
  async hybridSearch(
    query: string,
    options?: {
      limit?: number;
      contentType?: string;
      keywordWeight?: number; // 0-1, default 0.3
    }
  ): Promise<VectorSearchResult[]> {
    const keywordWeight = options?.keywordWeight ?? 0.3;
    const semanticWeight = 1 - keywordWeight;
    const limit = options?.limit || 10;

    // Get semantic results
    const semanticResults = await this.search(query, {
      limit: limit * 2,
      contentType: options?.contentType,
      minSimilarity: 0.2,
    });

    // Get keyword matches
    const entriesCollection = getEntriesCollection();
    if (!entriesCollection) return semanticResults;

    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    // Score map: entryId -> { semantic, keyword }
    const scores = new Map<string, { semantic: number; keyword: number; entry: Entry }>();

    // Add semantic scores
    for (const result of semanticResults) {
      scores.set(result.entry.id, {
        semantic: result.similarity,
        keyword: 0,
        entry: result.entry,
      });
    }

    // Calculate keyword scores for semantic results
    for (const [entryId, data] of scores) {
      const text = this.extractText(data.entry).toLowerCase();
      let keywordScore = 0;

      for (const word of queryWords) {
        if (text.includes(word)) {
          keywordScore += 1 / queryWords.length;
        }
      }

      // Exact phrase match bonus
      if (text.includes(queryLower)) {
        keywordScore += 0.5;
      }

      data.keyword = Math.min(keywordScore, 1);
    }

    // Calculate combined scores and sort
    const combined = Array.from(scores.values()).map(data => ({
      entry: data.entry,
      similarity: data.semantic * semanticWeight + data.keyword * keywordWeight,
    }));

    combined.sort((a, b) => b.similarity - a.similarity);

    return combined.slice(0, limit);
  }

  /**
   * Get index statistics
   */
  async getStats(): Promise<{
    isAvailable: boolean;
    model: string;
    dimensions: number;
    totalIndexed: number;
    byContentType: Record<string, number>;
  }> {
    if (!this.collection) {
      this.collection = getPluginCollection<VectorEntry>(VECTORS_COLLECTION);
    }

    const vectors = this.collection?.find() || [];
    const byContentType: Record<string, number> = {};

    for (const vec of vectors) {
      byContentType[vec.contentTypeSlug] = (byContentType[vec.contentTypeSlug] || 0) + 1;
    }

    return {
      isAvailable: this.isAvailable,
      model: this.config.model,
      dimensions: this.config.dimensions,
      totalIndexed: vectors.length,
      byContentType,
    };
  }

  /**
   * Check service availability
   */
  async isReady(): Promise<boolean> {
    await this.checkOllamaAvailability();
    return this.isAvailable;
  }
}

// Export singleton instance
export const vectorSearchService = new VectorSearchService();
