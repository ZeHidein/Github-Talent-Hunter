/**
 * Conversation Types
 *
 * Core types for the AgentConversation class.
 * These are framework-agnostic and work with any state management.
 */

import type { AgentContent, ComponentContent } from '../types/content.ts';

/**
 * Conversation status states
 */
export type ConversationStatus = 'idle' | 'streaming' | 'error';

/**
 * Message group - user request paired with agent responses.
 * Similar to AI SDK's message grouping pattern.
 */
export interface MessageGroup {
  /** Unique ID for this group */
  id: string;
  /** User message that started this exchange (null for initial agent messages) */
  request: AgentContent | null;
  /** All agent responses in this exchange */
  responses: AgentContent[];
}

/**
 * Main conversation state exposed to UI/state handlers.
 * This is what UI frameworks observe for reactivity.
 */
export interface ConversationState {
  /** All messages in order */
  messages: AgentContent[];
  /** Messages grouped by user request */
  groupedMessages: MessageGroup[];
  /** Current conversation status */
  status: ConversationStatus;
  /** Error if status is 'error' */
  error: Error | null;
}

/**
 * Headers type compatible with both Node.js and browser environments.
 */
export type ConversationHeaders = Record<string, string> | [string, string][];

/**
 * Configuration for AgentConversation.
 */
export interface ConversationConfig {
  /**
   * System tools that should not create visible messages.
   * StateUpdate is always included automatically.
   * @default ['UpdateChecklist']
   */
  hiddenSystemTools?: string[];

  /**
   * Convenience: attach a state listener at construction time.
   * This covers the common "one store owns the conversation" case and avoids
   * forgetting to unsubscribe.
   */
  onStateChange?: StateListener | StateListener[];

  /**
   * Convenience: attach a system tool handler at construction time.
   */
  onSystemTool?: SystemToolHandler | SystemToolHandler[];

  /**
   * Convenience: attach a message upsert handler at construction time.
   * Called with the specific message that was added or updated.
   * Enables efficient O(1) cache updates in state management.
   */
  onMessageUpsert?: MessageUpsertHandler | MessageUpsertHandler[];

  /**
   * Called after any state mutation with full snapshot.
   * Use for persistence - fires after every change, consumer can debounce.
   */
  onSnapshot?: SnapshotHandler | SnapshotHandler[];
}

/**
 * Parameters for sending a message.
 */
export interface SendParams {
  /** Message text content */
  content: string;
  /** File attachments */
  files?: Attachment[];
  /** Additional metadata to include in request */
  metadata?: Record<string, unknown>;
}

/**
 * Attachment type (simplified for library - apps can extend)
 */
export interface Attachment {
  name: string;
  type: string;
  data: string;
  [key: string]: unknown;
}

/**
 * Snapshot for persistence.
 * Contains everything needed to restore conversation state.
 */
export interface ConversationSnapshot {
  /** All messages */
  messages: AgentContent[];
  /** Last state update from server (includes conversation history) */
  lastStateUpdate: Record<string, unknown>;
}

/**
 * State listener callback type.
 * Receives both current and previous state for comparison.
 */
export type StateListener = (state: ConversationState, prevState: ConversationState) => void;

/**
 * System tool handler callback type.
 * Called for all Tool messages except StateUpdate.
 */
export type SystemToolHandler = (toolName: string, data: unknown) => void;

/**
 * Message upsert handler callback type.
 * Called when a message is added or updated, with the final merged message.
 * Enables O(1) cache updates instead of scanning all messages.
 *
 * @param message - The upserted message (after any merging)
 * @param isNew - true if this is a new message, false if updating existing
 */
export type MessageUpsertHandler = (message: AgentContent, isNew: boolean) => void;

/**
 * Snapshot handler callback type.
 * Called after any state mutation with full snapshot.
 * Use for persistence - fires after every change, consumer can debounce.
 */
export type SnapshotHandler = (snapshot: ConversationSnapshot) => void;

/**
 * Agent message payload (what comes from SSE stream).
 *
 * This is a discriminated union on `type`:
 * - Text: has `content: string`
 * - Tool: has `tool` and `content`
 * - Component: unified type for simple UI and streaming tools
 */
export type AgentMessagePayload =
  | AgentMessagePayloadText
  | AgentMessagePayloadTool
  | ComponentContent; // Unified component (simple UI or streaming tool)

interface AgentMessagePayloadBase {
  messageId: string;
  responseId?: string;
}

interface AgentMessagePayloadText extends AgentMessagePayloadBase {
  type: 'TXT';
  content: string;
  isReasoning?: boolean;
  role?: 'user';
  hidden?: boolean;
}

interface AgentMessagePayloadTool extends AgentMessagePayloadBase {
  type: 'Tool';
  tool: { name: string };
  content: unknown;
}
