/**
 * AgentConversation
 *
 * Framework-agnostic conversation manager that handles protocol-specific logic
 * automatically (StateUpdate, tool streaming, lastStateUpdate).
 *
 * Similar to AI SDK's useChat but designed for subscribe pattern.
 *
 * @example
 * ```typescript
 * // Simplest: With MobX
 * const conversation = new AgentConversation({
 *   onStateChange: action((state) => {
 *     this.messages = state.messages;
 *     this.status = state.status;
 *   }),
 *   onSystemTool: action((tool, data) => {
 *     if (tool === 'UpdateChecklist') {
 *       this.checklist = data.items;
 *     }
 *   }),
 * });
 *
 * // Process SSE events
 * handleSSE(event) {
 *   conversation.process(event);
 * }
 *
 * // API request includes lastStateUpdate automatically
 * await api.post('/chat', {
 *   message,
 *   ...conversation.getRequestPayload(),
 * });
 * ```
 */

import {
  ContentType,
  type AgentContent,
  type TextContent,
  type ComponentContent,
  createTextContent,
  createAudioContent,
} from '../types/content.ts';

import { computeMessageGroups } from './message-grouper.ts';

import type {
  ConversationState,
  ConversationConfig,
  ConversationSnapshot,
  StateListener,
  SystemToolHandler,
  MessageUpsertHandler,
  SnapshotHandler,
  AgentMessagePayload,
} from './types.ts';

const STATE_UPDATE_TOOL = 'StateUpdate';

/**
 * AgentConversation - Conversation lifecycle manager
 *
 * Handles:
 * - Message state management
 * - StateUpdate tool (protocol) - stored automatically
 * - Message grouping (user request + agent responses)
 * - Persistence (snapshot/restore)
 */
export class AgentConversation {
  // === Internal State ===

  private state: ConversationState = {
    messages: [],
    groupedMessages: [],
    status: 'idle',
    error: null,
  };

  private prevState: ConversationState = { ...this.state };

  /** Last StateUpdate from server (sent with next request) */
  private lastStateUpdate: Record<string, unknown> = {};

  /** State change handlers (constructor callbacks only) */
  private stateListeners: StateListener[] = [];

  /** System tool handlers (constructor callbacks only) */
  private systemToolHandlers: SystemToolHandler[] = [];

  /** Message upsert handlers (constructor callbacks only) */
  private messageUpsertHandlers: MessageUpsertHandler[] = [];

  /** Snapshot handlers (constructor callbacks only) */
  private snapshotHandlers: SnapshotHandler[] = [];

  /** Configuration */
  private config: ConversationConfig;

  constructor(config: ConversationConfig = {}) {
    this.config = {
      hiddenSystemTools: ['UpdateChecklist'],
      ...config,
    };

    const stateListeners = this.config.onStateChange;
    this.stateListeners = stateListeners
      ? Array.isArray(stateListeners)
        ? stateListeners
        : [stateListeners]
      : [];

    const systemToolHandlers = this.config.onSystemTool;
    this.systemToolHandlers = systemToolHandlers
      ? Array.isArray(systemToolHandlers)
        ? systemToolHandlers
        : [systemToolHandlers]
      : [];

    const messageUpsertHandlers = this.config.onMessageUpsert;
    this.messageUpsertHandlers = messageUpsertHandlers
      ? Array.isArray(messageUpsertHandlers)
        ? messageUpsertHandlers
        : [messageUpsertHandlers]
      : [];

    const snapshotHandlers = this.config.onSnapshot;
    this.snapshotHandlers = snapshotHandlers
      ? Array.isArray(snapshotHandlers)
        ? snapshotHandlers
        : [snapshotHandlers]
      : [];

    // Keep backwards behavior: call state listeners immediately with current state.
    this.stateListeners.forEach((listener) => {
      listener(this.state, this.prevState);
    });
  }

  // === Actions ===

  /**
   * Clear all messages and state.
   */
  clear(): void {
    this.lastStateUpdate = {};
    this.setState({
      messages: [],
      groupedMessages: [],
      status: 'idle',
      error: null,
    });
  }

  /**
   * Add a user message to the conversation.
   * Use this when handling transport yourself.
   *
   * @param params.content - Text string or audio data object
   * @param params.extra - Optional app-specific fields (e.g., files, uiText)
   * @returns The generated message ID
   *
   * @example
   * ```typescript
   * // Simple text message
   * const messageId = conversation.addUserMessage({ content: 'Hello!' });
   *
   * // With app-specific extensions
   * const messageId = conversation.addUserMessage({
   *   content: 'Check this file',
   *   extra: { files: [...], uiText: 'display text' },
   * });
   * ```
   */
  addUserMessage(params: {
    content: string | { data: string; text?: string };
    extra?: Record<string, unknown>;
  }): string {
    const messageId = crypto.randomUUID();

    let message: AgentContent;
    if (typeof params.content === 'string') {
      message = {
        ...createTextContent({
          messageId,
          content: params.content,
          role: 'user',
        }),
        ...params.extra,
      };
    } else {
      message = {
        ...createAudioContent({
          messageId,
          content: params.content,
          role: 'user',
        }),
        ...params.extra,
      };
    }

    const messages = [...this.state.messages, message];
    this.messageUpsertHandlers.forEach((handler) => {
      void handler(message, true);
    });
    this.setState({ messages });

    return messageId;
  }

  // === Manual Transport Mode ===

  /**
   * Process an incoming SSE event.
   * Use this when handling transport yourself.
   *
   * Handles automatically:
   * - StateUpdate tool (stored for next request)
   * - Text/Component messages
   *
   * @example
   * ```typescript
   * eventSource.onmessage = (event) => {
   *   const payload = JSON.parse(event.data);
   *   conversation.process(payload);
   * };
   * ```
   */
  process(payload: AgentMessagePayload): void {
    // 1. Handle StateUpdate (protocol - automatic)
    if (payload.type === ContentType.Tool) {
      const toolPayload = payload as AgentMessagePayload & {
        tool: { name: string };
        content: unknown;
      };
      if (toolPayload.tool?.name === STATE_UPDATE_TOOL) {
        this.lastStateUpdate = toolPayload.content as Record<string, unknown>;
        return; // Don't create message
      }

      // 2. Handle app-specific system tools
      this.systemToolHandlers.forEach((handler) => {
        handler(toolPayload.tool.name, toolPayload.content);
      });
      return; // Don't create visible message for tools
    }

    // 3. Handle text
    if (payload.type === ContentType.Text) {
      const content = createTextContent({
        messageId: payload.messageId,
        responseId: payload.responseId,
        content: payload.content as string,
        isReasoning: payload.isReasoning,
        role: payload.role,
        hidden: payload.hidden,
      });
      this.upsertMessage(content);
      return;
    }

    // 4. Handle Component (unified type - simple UI or streaming tool)
    if (payload.type === ContentType.Component) {
      this.upsertMessage(payload as AgentContent);
      return;
    }
  }

  /**
   * Get payload to include in your API request.
   * Includes lastStateUpdate for server to continue conversation.
   *
   * @example
   * ```typescript
   * await api.post('/chat', {
   *   message: { type: 'TXT', content: text },
   *   files,
   *   ...conversation.getRequestPayload(),
   * });
   * ```
   */
  getRequestPayload(): { lastStateUpdate: Record<string, unknown> } {
    return {
      lastStateUpdate: this.lastStateUpdate,
    };
  }

  /**
   * Set streaming status.
   * Call when starting a request (if using manual transport).
   */
  setStreaming(): void {
    this.setStatus('streaming');
  }

  /**
   * Set idle status.
   * Call when request completes (if using manual transport).
   */
  setIdle(): void {
    this.setStatus('idle');
  }

  // === Persistence ===

  /**
   * Get snapshot for saving to storage.
   *
   * @example
   * ```typescript
   * localStorage.setItem('chat', JSON.stringify(conversation.snapshot()));
   * ```
   */
  snapshot(): ConversationSnapshot {
    return {
      messages: this.state.messages,
      lastStateUpdate: this.lastStateUpdate,
    };
  }

  /**
   * Restore from snapshot.
   *
   * @example
   * ```typescript
   * const saved = JSON.parse(localStorage.getItem('chat'));
   * if (saved) conversation.restore(saved);
   * ```
   */
  restore(snapshot: ConversationSnapshot): void {
    this.lastStateUpdate = snapshot.lastStateUpdate || {};
    const messages = snapshot.messages || [];

    messages.forEach((message) => {
      this.messageUpsertHandlers.forEach((handler) => {
        void handler(message, true);
      });
    });

    this.setState({
      messages,
      groupedMessages: computeMessageGroups(messages),
      status: 'idle',
      error: null,
    });
  }

  // === Getters ===

  /**
   * Get current state (read-only).
   * Prefer using `onStateChange` constructor callback for reactive updates.
   */
  getState(): Readonly<ConversationState> {
    return this.state;
  }

  /**
   * Get last state update (conversation history).
   */
  getLastStateUpdate(): Record<string, unknown> {
    return this.lastStateUpdate;
  }

  // === Internal Methods ===

  private setState(partial: Partial<ConversationState>): void {
    this.prevState = { ...this.state };
    this.state = { ...this.state, ...partial };

    this.stateListeners.forEach((listener) => {
      listener(this.state, this.prevState);
    });

    this.notifySnapshot();
  }

  private setStatus(status: ConversationState['status']): void {
    this.setState({ status, error: status === 'idle' ? null : this.state.error });
  }

  private setError(error: Error): void {
    this.setState({ status: 'error', error });
  }

  /**
   * Notify snapshot handlers with current snapshot.
   * Called after any state mutation.
   */
  private notifySnapshot(): void {
    if (this.snapshotHandlers.length === 0) {
      return;
    }
    const snapshot = this.snapshot();
    this.snapshotHandlers.forEach((handler) => {
      void handler(snapshot);
    });
  }

  /**
   * Upsert message - update existing or add new.
   *
   * Text merge strategy depends on role:
   * - **User messages** are sent as a single payload (never streamed in chunks),
   *   so a duplicate `messageId` means a replay (reconnect / resume).
   *   We replace the content idempotently instead of concatenating.
   * - **Assistant messages** arrive as streaming chunks sharing a `messageId`,
   *   so we append (accumulate) content.
   *
   * Flags (`hidden`, `role`) are preserved with "sticky" semantics:
   * once set to a truthy value they are never downgraded by a later update.
   */
  private upsertMessage(content: AgentContent): void {
    const messages = [...this.state.messages];
    const existingIndex = messages.findIndex((m) => m.messageId === content.messageId);
    const isNew = existingIndex < 0;

    if (!isNew) {
      const existing = messages[existingIndex];

      if (existing.type === ContentType.Text && content.type === ContentType.Text) {
        const prev = existing as TextContent;
        const next = content as TextContent;

        const mergedRole = prev.role ?? next.role;
        const mergedHidden = prev.hidden || next.hidden || undefined;

        // User messages: idempotent replace (sent once, never streamed).
        // Keep previous content when the incoming payload is empty (e.g. replay of hidden welcome message).
        const isUserMessage = mergedRole === 'user';
        const mergedContent = isUserMessage
          ? next.content || prev.content
          : prev.content + next.content;

        messages[existingIndex] = {
          ...prev,
          content: mergedContent,
          isReasoning: next.isReasoning,
          role: mergedRole,
          hidden: mergedHidden,
        } as TextContent;
      }
      // Component: merge props and streaming state
      else if (existing.type === ContentType.Component && content.type === ContentType.Component) {
        const existingComp = existing as ComponentContent;
        const newComp = content as ComponentContent;

        // Merge streaming state if both have it
        let mergedStreaming = newComp.streaming;
        if (existingComp.streaming && newComp.streaming) {
          mergedStreaming = {
            ...existingComp.streaming,
            ...newComp.streaming,
            // Accumulate inputDelta
            inputDelta:
              (existingComp.streaming.inputDelta || '') + (newComp.streaming.inputDelta || ''),
            // Prefer new values, fallback to existing
            input: newComp.streaming.input ?? existingComp.streaming.input,
            error: newComp.streaming.error ?? existingComp.streaming.error,
          };
        }

        messages[existingIndex] = {
          ...existingComp,
          ...newComp,
          // Merge props
          props: { ...existingComp.props, ...newComp.props },
          streaming: mergedStreaming,
        };
      }
      // Otherwise replace
      else {
        messages[existingIndex] = content;
      }
    } else {
      messages.push(content);
    }

    const finalMessage = isNew ? content : messages[existingIndex];
    this.messageUpsertHandlers.forEach((handler) => {
      void handler(finalMessage, isNew);
    });

    this.setState({ messages });
  }
}
