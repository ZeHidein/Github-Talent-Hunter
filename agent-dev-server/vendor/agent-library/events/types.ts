/**
 * Event types for the inbox/outbox pipeline.
 */

import type { AgentStateStore } from '../state/agent-state-store.ts';

/** Trigger event written to /inbox/triggers/{provider}/{eventId} */
export interface TriggerEvent {
  /** Unique event ID (from Composio log_id or generated) */
  eventId: string;
  /** Trigger slug, e.g. 'github_issue_created' */
  triggerName: string;
  /** Provider slug, e.g. 'github' */
  provider: string;
  /** Trigger-specific payload data */
  payload: Record<string, unknown>;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Composio trigger instance ID */
  triggerId?: string;
  /** Composio connected account ID */
  connectedAccountId?: string;
}

/** Context passed to trigger handlers. */
export interface TriggerContext {
  /** The agent's state store */
  store: AgentStateStore;
}

/** Returned by a handler to optionally forward the event to the LLM. */
export interface TriggerHandlerResult {
  /** When true, the event is also forwarded to the onUnhandled (LLM) callback after the handler completes. */
  passToLlm: true;
  /** Optional data the handler wants to pass along to the LLM (e.g. a summary or extracted fields). */
  data?: Record<string, unknown>;
}

/** A function that handles a trigger event. */
export type TriggerHandler = (
  event: TriggerEvent,
  ctx: TriggerContext,
) => TriggerHandlerResult | undefined | Promise<TriggerHandlerResult | undefined>;

/** Callback invoked when no handler is registered for a trigger (LLM fallback). */
export type UnhandledTriggerCallback = (
  event: TriggerEvent,
  /** Data returned by the handler when passToLlm is true. Undefined for unhandled triggers. */
  handlerData?: Record<string, unknown>,
) => Promise<void> | void;
