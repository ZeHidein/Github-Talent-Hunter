/**
 * TriggerDispatcher — routes trigger events to registered handlers.
 *
 * If a handler is registered for the trigger name → executes it.
 * If no handler → calls the onUnhandled callback (LLM fallback).
 * If neither → logs a warning.
 */

import type { AgentStateStore } from '../state/agent-state-store.ts';
import type { TriggerRouter } from './trigger-router.ts';
import type { TriggerEvent, UnhandledTriggerCallback } from './types.ts';

export interface TriggerDispatcherOptions {
  router: TriggerRouter;
  store: AgentStateStore;
  /** Called when no handler is registered for a trigger. Typically sends to LLM. */
  onUnhandled?: UnhandledTriggerCallback;
}

export class TriggerDispatcher {
  #router: TriggerRouter;
  #store: AgentStateStore;
  #onUnhandled?: UnhandledTriggerCallback;

  constructor(options: TriggerDispatcherOptions) {
    this.#router = options.router;
    this.#store = options.store;
    this.#onUnhandled = options.onUnhandled;
  }

  async dispatch(event: TriggerEvent): Promise<void> {
    const handler = this.#router.getHandler(event.triggerName);

    if (handler) {
      const result = await handler(event, { store: this.#store });

      if (result?.passToLlm && this.#onUnhandled) {
        await this.#onUnhandled(event, result.data);
      }
      return;
    }

    if (this.#onUnhandled) {
      await this.#onUnhandled(event);
      return;
    }

    console.warn(
      `[TriggerDispatcher] No handler for trigger '${event.triggerName}' and no fallback configured`,
    );
  }
}
