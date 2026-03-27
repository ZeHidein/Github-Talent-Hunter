/**
 * TriggerRouter — registry for typed trigger handlers.
 *
 * Instance-based (no global singleton) so that multiple agents sharing
 * the same process each get their own isolated set of handlers.
 *
 * @example
 * ```typescript
 * const router = new TriggerRouter();
 * router.register('github_issue_created', async (event, ctx) => {
 *   await ctx.store.set(`/data/issues/${event.payload.issue.number}`, event.payload);
 * });
 * ```
 */

import type { TriggerHandler } from './types.ts';

export class TriggerRouter {
  #handlers = new Map<string, TriggerHandler>();

  /** Register a handler for a trigger name. Overwrites any existing handler. */
  register(triggerName: string, handler: TriggerHandler): void {
    this.#handlers.set(triggerName, handler);
  }

  /** Get the handler for a trigger name, or undefined if none registered. */
  getHandler(triggerName: string): TriggerHandler | undefined {
    return this.#handlers.get(triggerName);
  }

  /** Check if a handler is registered for a trigger name. */
  has(triggerName: string): boolean {
    return this.#handlers.has(triggerName);
  }

  /** Get all registered trigger names. */
  getRegisteredTriggers(): string[] {
    return [...this.#handlers.keys()];
  }
}
