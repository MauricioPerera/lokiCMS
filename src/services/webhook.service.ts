/**
 * Webhook Service
 * Send notifications to external systems on CMS events
 */

import { nanoid } from 'nanoid';
import { addPluginCollection, getPluginCollection } from '../db/index.js';
import { hookSystem } from '../plugins/index.js';
import type { Collection } from '../lib/lokijs/index.js';

// Webhook configuration
export interface Webhook {
  id: string;
  name: string;
  url: string;
  secret?: string;
  events: WebhookEvent[];
  contentTypes?: string[]; // Filter by content type slugs
  isActive: boolean;
  headers?: Record<string, string>;
  retryCount: number;
  retryDelay: number; // ms
  createdAt: number;
  updatedAt: number;
  lastTriggeredAt?: number;
  successCount: number;
  failureCount: number;
}

export type WebhookEvent =
  | 'entry:create'
  | 'entry:update'
  | 'entry:delete'
  | 'entry:publish'
  | 'entry:unpublish'
  | 'user:create'
  | 'user:update'
  | 'user:delete'
  | 'content-type:create'
  | 'content-type:update'
  | 'content-type:delete';

// Webhook delivery log
export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  payload: Record<string, unknown>;
  status: 'pending' | 'success' | 'failed';
  statusCode?: number;
  response?: string;
  error?: string;
  attempts: number;
  createdAt: number;
  completedAt?: number;
}

const WEBHOOKS_COLLECTION = '_webhooks';
const DELIVERIES_COLLECTION = '_webhook_deliveries';
const MAX_DELIVERIES_RETENTION = 7 * 24 * 60 * 60 * 1000; // 7 days

export class WebhookService {
  private webhooksCollection: Collection<Webhook> | null = null;
  private deliveriesCollection: Collection<WebhookDelivery> | null = null;

  /**
   * Initialize webhook collections
   */
  async initialize(): Promise<void> {
    this.webhooksCollection = addPluginCollection<Webhook>(WEBHOOKS_COLLECTION, {
      indices: ['isActive', 'events'],
    });

    this.deliveriesCollection = addPluginCollection<WebhookDelivery>(DELIVERIES_COLLECTION, {
      indices: ['webhookId', 'status', 'createdAt'],
    });

    console.log('[Webhooks] Collections initialized');

    // Register hooks
    this.registerHooks();

    // Cleanup old deliveries
    this.cleanupOldDeliveries();
  }

  /**
   * Register hooks for webhook triggering
   */
  private registerHooks(): void {
    const PLUGIN_NAME = '_webhooks';

    // Entry events
    hookSystem.register('entry:afterCreate', PLUGIN_NAME, async (payload) => {
      await this.trigger('entry:create', payload);
      return payload;
    });

    hookSystem.register('entry:afterUpdate', PLUGIN_NAME, async (payload) => {
      await this.trigger('entry:update', payload);
      return payload;
    });

    hookSystem.register('entry:afterDelete', PLUGIN_NAME, async (payload) => {
      await this.trigger('entry:delete', payload);
      return payload;
    });

    hookSystem.register('entry:afterPublish', PLUGIN_NAME, async (payload) => {
      await this.trigger('entry:publish', payload);
      return payload;
    });

    hookSystem.register('entry:afterUnpublish', PLUGIN_NAME, async (payload) => {
      await this.trigger('entry:unpublish', payload);
      return payload;
    });

    // User events
    hookSystem.register('user:afterCreate', PLUGIN_NAME, async (payload) => {
      await this.trigger('user:create', payload);
      return payload;
    });

    hookSystem.register('user:afterUpdate', PLUGIN_NAME, async (payload) => {
      await this.trigger('user:update', payload);
      return payload;
    });

    hookSystem.register('user:afterDelete', PLUGIN_NAME, async (payload) => {
      await this.trigger('user:delete', payload);
      return payload;
    });

    // Content type events
    hookSystem.register('contentType:afterCreate', PLUGIN_NAME, async (payload) => {
      await this.trigger('content-type:create', payload);
      return payload;
    });

    hookSystem.register('contentType:afterUpdate', PLUGIN_NAME, async (payload) => {
      await this.trigger('content-type:update', payload);
      return payload;
    });

    hookSystem.register('contentType:afterDelete', PLUGIN_NAME, async (payload) => {
      await this.trigger('content-type:delete', payload);
      return payload;
    });

    console.log('[Webhooks] Hooks registered');
  }

  /**
   * Create a new webhook
   */
  async create(input: {
    name: string;
    url: string;
    secret?: string;
    events: WebhookEvent[];
    contentTypes?: string[];
    headers?: Record<string, string>;
    retryCount?: number;
    retryDelay?: number;
  }): Promise<Webhook> {
    if (!this.webhooksCollection) {
      this.webhooksCollection = getPluginCollection<Webhook>(WEBHOOKS_COLLECTION);
    }

    if (!this.webhooksCollection) {
      throw new Error('Webhooks collection not initialized');
    }

    const webhook: Webhook = {
      id: nanoid(),
      name: input.name,
      url: input.url,
      secret: input.secret,
      events: input.events,
      contentTypes: input.contentTypes,
      headers: input.headers,
      isActive: true,
      retryCount: input.retryCount ?? 3,
      retryDelay: input.retryDelay ?? 5000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      successCount: 0,
      failureCount: 0,
    };

    this.webhooksCollection.insert(webhook);
    console.log(`[Webhooks] Created webhook: ${webhook.name}`);

    return webhook;
  }

  /**
   * Update a webhook
   */
  async update(
    id: string,
    input: Partial<Omit<Webhook, 'id' | 'createdAt' | 'successCount' | 'failureCount'>>
  ): Promise<Webhook> {
    if (!this.webhooksCollection) {
      this.webhooksCollection = getPluginCollection<Webhook>(WEBHOOKS_COLLECTION);
    }

    if (!this.webhooksCollection) {
      throw new Error('Webhooks collection not initialized');
    }

    const webhook = this.webhooksCollection.findOne({ id });
    if (!webhook) {
      throw new Error('Webhook not found');
    }

    Object.assign(webhook, input, { updatedAt: Date.now() });
    this.webhooksCollection.update(webhook);

    return webhook;
  }

  /**
   * Delete a webhook
   */
  async delete(id: string): Promise<void> {
    if (!this.webhooksCollection) {
      this.webhooksCollection = getPluginCollection<Webhook>(WEBHOOKS_COLLECTION);
    }

    if (!this.webhooksCollection) {
      throw new Error('Webhooks collection not initialized');
    }

    const webhook = this.webhooksCollection.findOne({ id });
    if (!webhook) {
      throw new Error('Webhook not found');
    }

    this.webhooksCollection.remove(webhook);
    console.log(`[Webhooks] Deleted webhook: ${webhook.name}`);
  }

  /**
   * Get all webhooks
   */
  async list(): Promise<Webhook[]> {
    if (!this.webhooksCollection) {
      this.webhooksCollection = getPluginCollection<Webhook>(WEBHOOKS_COLLECTION);
    }

    return this.webhooksCollection?.find() || [];
  }

  /**
   * Get a webhook by ID
   */
  async get(id: string): Promise<Webhook | null> {
    if (!this.webhooksCollection) {
      this.webhooksCollection = getPluginCollection<Webhook>(WEBHOOKS_COLLECTION);
    }

    return this.webhooksCollection?.findOne({ id }) || null;
  }

  /**
   * Trigger webhooks for an event
   */
  async trigger(event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
    if (!this.webhooksCollection) {
      this.webhooksCollection = getPluginCollection<Webhook>(WEBHOOKS_COLLECTION);
    }

    if (!this.webhooksCollection) return;

    // Find active webhooks subscribed to this event
    const webhooks = this.webhooksCollection.find({
      isActive: true,
    });

    const matchingWebhooks = webhooks.filter((w) => w.events.includes(event));

    // Filter by content type if applicable
    const entry = payload.entry as { contentTypeSlug?: string } | undefined;
    const contentTypeSlug = entry?.contentTypeSlug;

    for (const webhook of matchingWebhooks) {
      // Skip if webhook has content type filter and entry doesn't match
      if (webhook.contentTypes && webhook.contentTypes.length > 0 && contentTypeSlug) {
        if (!webhook.contentTypes.includes(contentTypeSlug)) {
          continue;
        }
      }

      // Deliver webhook asynchronously
      this.deliver(webhook, event, payload).catch((err) => {
        console.error(`[Webhooks] Delivery error for ${webhook.name}:`, err);
      });
    }
  }

  /**
   * Deliver a webhook
   */
  private async deliver(
    webhookDoc: Webhook,
    event: WebhookEvent,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!this.deliveriesCollection) {
      this.deliveriesCollection = getPluginCollection<WebhookDelivery>(DELIVERIES_COLLECTION);
    }

    if (!this.deliveriesCollection || !this.webhooksCollection) return;

    // Get the actual webhook document from collection for updates
    const webhook = this.webhooksCollection.findOne({ id: webhookDoc.id });
    if (!webhook) return;

    // Create delivery record
    const deliveryId = nanoid();
    const deliveryData: WebhookDelivery = {
      id: deliveryId,
      webhookId: webhook.id,
      event,
      payload,
      status: 'pending',
      attempts: 0,
      createdAt: Date.now(),
    };

    this.deliveriesCollection.insert(deliveryData);

    // Get the inserted document for updates
    const delivery = this.deliveriesCollection.findOne({ id: deliveryId });
    if (!delivery) return;

    // Prepare request body
    const body = JSON.stringify({
      event,
      timestamp: Date.now(),
      webhookId: webhook.id,
      data: payload,
    });

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': event,
      'X-Webhook-Id': webhook.id,
      'X-Webhook-Timestamp': Date.now().toString(),
      ...webhook.headers,
    };

    // Add signature if secret is set
    if (webhook.secret) {
      const signature = await this.computeSignature(body, webhook.secret);
      headers['X-Webhook-Signature'] = signature;
    }

    // Attempt delivery with retries
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= webhook.retryCount + 1; attempt++) {
      delivery.attempts = attempt;

      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(30000), // 30s timeout
        });

        delivery.statusCode = response.status;
        delivery.response = await response.text().catch(() => '');

        if (response.ok) {
          delivery.status = 'success';
          delivery.completedAt = Date.now();
          this.deliveriesCollection.update(delivery);

          // Update webhook stats
          webhook.lastTriggeredAt = Date.now();
          webhook.successCount++;
          this.webhooksCollection.update(webhook);

          console.log(`[Webhooks] Delivered ${event} to ${webhook.name}`);
          return;
        }

        lastError = new Error(`HTTP ${response.status}: ${delivery.response}`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        delivery.error = lastError.message;
      }

      // Wait before retry
      if (attempt < webhook.retryCount + 1) {
        await new Promise((resolve) => setTimeout(resolve, webhook.retryDelay * attempt));
      }
    }

    // All retries failed
    delivery.status = 'failed';
    delivery.error = lastError?.message;
    delivery.completedAt = Date.now();
    this.deliveriesCollection.update(delivery);

    // Update webhook stats
    webhook.failureCount++;
    this.webhooksCollection.update(webhook);

    console.error(`[Webhooks] Failed to deliver ${event} to ${webhook.name}: ${lastError?.message}`);
  }

  /**
   * Compute HMAC signature for webhook payload
   */
  private async computeSignature(payload: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    return 'sha256=' + Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Get delivery history for a webhook
   */
  async getDeliveries(webhookId: string, limit = 20): Promise<WebhookDelivery[]> {
    if (!this.deliveriesCollection) {
      this.deliveriesCollection = getPluginCollection<WebhookDelivery>(DELIVERIES_COLLECTION);
    }

    if (!this.deliveriesCollection) return [];

    return this.deliveriesCollection
      .chain()
      .find({ webhookId })
      .simplesort('createdAt', true)
      .limit(limit)
      .data();
  }

  /**
   * Test a webhook by sending a test event
   */
  async test(id: string): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const webhook = await this.get(id);
    if (!webhook) {
      throw new Error('Webhook not found');
    }

    const testPayload = {
      test: true,
      message: 'This is a test webhook from LokiCMS',
      timestamp: Date.now(),
    };

    try {
      const body = JSON.stringify({
        event: 'test',
        timestamp: Date.now(),
        webhookId: webhook.id,
        data: testPayload,
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Event': 'test',
        'X-Webhook-Id': webhook.id,
        ...webhook.headers,
      };

      if (webhook.secret) {
        headers['X-Webhook-Signature'] = await this.computeSignature(body, webhook.secret);
      }

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10000),
      });

      return {
        success: response.ok,
        statusCode: response.status,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Cleanup old delivery logs
   */
  private cleanupOldDeliveries(): void {
    if (!this.deliveriesCollection) return;

    const cutoff = Date.now() - MAX_DELIVERIES_RETENTION;
    const old = this.deliveriesCollection.find({
      createdAt: { '$lt': cutoff },
    });

    if (old.length > 0) {
      this.deliveriesCollection.findAndRemove({
        createdAt: { '$lt': cutoff },
      });
      console.log(`[Webhooks] Cleaned up ${old.length} old delivery logs`);
    }
  }

  /**
   * Get webhook statistics
   */
  async getStats(): Promise<{
    totalWebhooks: number;
    activeWebhooks: number;
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
  }> {
    if (!this.webhooksCollection) {
      this.webhooksCollection = getPluginCollection<Webhook>(WEBHOOKS_COLLECTION);
    }
    if (!this.deliveriesCollection) {
      this.deliveriesCollection = getPluginCollection<WebhookDelivery>(DELIVERIES_COLLECTION);
    }

    const webhooks = this.webhooksCollection?.find() || [];
    const deliveries = this.deliveriesCollection?.find() || [];

    return {
      totalWebhooks: webhooks.length,
      activeWebhooks: webhooks.filter((w) => w.isActive).length,
      totalDeliveries: deliveries.length,
      successfulDeliveries: deliveries.filter((d) => d.status === 'success').length,
      failedDeliveries: deliveries.filter((d) => d.status === 'failed').length,
    };
  }
}

// Export singleton instance
export const webhookService = new WebhookService();
