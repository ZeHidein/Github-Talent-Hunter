/**
 * InboxReconciler — startup scan for missed events.
 *
 * On every agent boot, scans `/inbox/` for unprocessed events and dispatches
 * them through the EventProcessor. Handles the "VM was sleeping" case.
 *
 * Events that were already processed (live subscription delivered them before
 * reconciler runs) are deduplicated by EventProcessor's processedEvents set.
 */

import type { AgentStateStore } from '../state/agent-state-store.ts';
import type { EventProcessor } from './event-processor.ts';

export interface InboxReconcilerOptions {
  store: AgentStateStore;
  processor: EventProcessor;
}

export class InboxReconciler {
  #store: AgentStateStore;
  #processor: EventProcessor;

  constructor(options: InboxReconcilerOptions) {
    this.#store = options.store;
    this.#processor = options.processor;
  }

  /**
   * Scan the inbox for unprocessed events and dispatch them.
   * Safe to call multiple times — EventProcessor deduplicates.
   */
  async reconcile(): Promise<number> {
    const paths = await this.#store.list('/inbox/');
    console.log('[InboxReconciler] Scanning inbox', {
      foundPaths: paths.length,
      paths,
    });

    let dispatched = 0;
    for (const path of paths) {
      try {
        const value = await this.#store.get(path);
        if (value !== null && typeof value === 'object') {
          const eventId = (value as Record<string, unknown>).eventId as string | undefined;
          const alreadyProcessed = eventId ? this.#processor.isProcessed(eventId) : false;
          console.log('[InboxReconciler] Processing inbox entry', {
            path,
            eventId,
            alreadyProcessed,
          });
          this.#processor.processEvent(path, value as Record<string, unknown>);
          dispatched++;
        }
      } catch (err) {
        console.error(`[InboxReconciler] Failed to process ${path}, continuing:`, err);
      }
    }

    console.log(`[InboxReconciler] Done — dispatched ${dispatched} of ${paths.length} event(s)`);
    return dispatched;
  }
}
