/**
 * EventProcessor — central event router for the inbox pipeline.
 *
 * Subscribes to `/inbox/**` via AgentStateStore and routes events by path prefix:
 *   /inbox/triggers/** → TriggerDispatcher
 *   /inbox/channels/** → ChannelHandler  (Phase 4)
 *   /inbox/cron/**     → CronHandler     (Phase 5)
 *   /inbox/agents/**   → AgentCommHandler (Phase 6)
 *
 * Deduplicates events by eventId to handle overlapping delivery paths
 * (live subscription + InboxReconciler on startup).
 */

import type { AgentStateStore } from '../state/agent-state-store.ts';
import type { Unsubscribe } from '../state/types.ts';
import type { TriggerDispatcher } from './trigger-dispatcher.ts';
import type { TriggerEvent } from './types.ts';

export interface EventProcessorOptions {
  store: AgentStateStore;
  triggerDispatcher: TriggerDispatcher;
}

export class EventProcessor {
  #store: AgentStateStore;
  #triggerDispatcher: TriggerDispatcher;
  #unsubscribe: Unsubscribe | null = null;
  #processedEvents = new Set<string>();
  #inflight = new Set<Promise<void>>();
  #started = false;

  constructor(options: EventProcessorOptions) {
    this.#store = options.store;
    this.#triggerDispatcher = options.triggerDispatcher;
  }

  /** Subscribe to inbox and start processing events. */
  start(): void {
    if (this.#started) {
      return;
    }
    this.#started = true;
    console.log('[EventProcessor] Starting — subscribing to /inbox/**');

    this.#unsubscribe = this.#store.subscribe('/inbox/**', (event) => {
      console.log('[EventProcessor] Subscription fired', {
        path: event.path,
        change: event.change,
        source: event.source,
        hasValue: event.value !== undefined,
      });
      if (event.change !== 'set' || event.value === undefined) {
        return;
      }
      this.#processEvent(event.path, event.value as Record<string, unknown>);
    });
  }

  /** Unsubscribe and stop processing. Awaits in-flight dispatches. */
  async stop(): Promise<void> {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#started = false;
    if (this.#inflight.size > 0) {
      console.log(`[EventProcessor] Draining ${this.#inflight.size} in-flight dispatch(es)`);
      await Promise.allSettled(this.#inflight);
    }
  }

  /**
   * Process a single event. Used by both the live subscription and InboxReconciler.
   * Deduplicates by eventId.
   */
  processEvent(path: string, value: Record<string, unknown>): void {
    this.#processEvent(path, value);
  }

  /** Check if an event was already processed. */
  isProcessed(eventId: string): boolean {
    return this.#processedEvents.has(eventId);
  }

  #processEvent(path: string, eventData: Record<string, unknown>): void {
    const eventId = (eventData.eventId as string) || path;

    if (this.#processedEvents.has(eventId)) {
      console.log('[EventProcessor] Dedup — skipping already processed event', {
        eventId,
        path,
        processedCount: this.#processedEvents.size,
      });
      return;
    }
    this.#processedEvents.add(eventId);
    console.log('[EventProcessor] Processing new event', {
      eventId,
      path,
      processedCount: this.#processedEvents.size,
    });

    // Limit dedup set size to prevent unbounded growth — batch evict oldest 20%
    if (this.#processedEvents.size > 10_000) {
      const evictCount = 2_000;
      let removed = 0;
      for (const key of this.#processedEvents) {
        if (removed >= evictCount) {
          break;
        }
        this.#processedEvents.delete(key);
        removed++;
      }
    }

    // Route by path prefix
    if (path.startsWith('/inbox/triggers/')) {
      this.#handleTrigger(path, eventData);
    }
    // Phase 4: else if (path.startsWith('/inbox/channels/'))
    // Phase 5: else if (path.startsWith('/inbox/cron/'))
    // Phase 6: else if (path.startsWith('/inbox/agents/'))
  }

  #handleTrigger(path: string, eventData: Record<string, unknown>): void {
    const triggerEvent: TriggerEvent = {
      eventId: (eventData.eventId as string) || '',
      triggerName: (eventData.triggerName as string) || '',
      provider: (eventData.provider as string) || '',
      payload: (eventData.payload as Record<string, unknown>) || {},
      timestamp: (eventData.timestamp as string) || new Date().toISOString(),
      triggerId: eventData.triggerId as string | undefined,
      connectedAccountId: eventData.connectedAccountId as string | undefined,
    };

    console.log('[EventProcessor] Dispatching trigger', {
      eventId: triggerEvent.eventId,
      triggerName: triggerEvent.triggerName,
      provider: triggerEvent.provider,
      path,
    });

    const p = this.#triggerDispatcher
      .dispatch(triggerEvent)
      .then(() => {
        console.log('[EventProcessor] Trigger dispatched, deleting inbox entry', {
          eventId: triggerEvent.eventId,
          path,
        });
        return this.#store.delete(path);
      })
      .then(() => {
        console.log('[EventProcessor] Inbox entry deleted', {
          eventId: triggerEvent.eventId,
          path,
        });
      })
      .catch((err) => {
        console.error(`[EventProcessor] Failed to process trigger at ${path}:`, err);
        // Remove from dedup set so InboxReconciler can retry on next boot
        this.#processedEvents.delete(triggerEvent.eventId || path);
      })
      .finally(() => {
        this.#inflight.delete(p);
      });
    this.#inflight.add(p);
  }
}
