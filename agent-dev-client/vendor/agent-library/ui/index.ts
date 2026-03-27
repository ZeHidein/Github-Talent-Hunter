/**
 * @agentplace/agent/ui - React UI Utilities
 *
 * Provides React hooks, state management, and conversation utilities for building agent UIs.
 *
 * ## Content State Management
 *
 * Use `contentReducer` with React's `useReducer` or any state library:
 *
 * ```tsx
 * const [state, dispatch] = useReducer(contentReducer, undefined, createInitialContentState);
 *
 * for await (const content of stream) {
 *   dispatch({ type: 'append', content });
 * }
 * ```
 *
 * ## React Hooks
 *
 * ```tsx
 * const { contents, isStreaming, start } = useAgentStream();
 * ```
 *
 * ## Conversation Management
 *
 * Multiple levels of abstraction:
 *
 * 1. **AgentConversation** - High-level, batteries-included
 * 2. **processAgentEvent** - Mid-level, stateless processing
 * 3. **Utilities** - Low-level primitives
 *
 * ```typescript
 * const conversation = new AgentConversation({
 *   onStateChange: (state) => {
 *     renderChat(state.messages);
 *   },
 * });
 *
 * conversation.process(event);
 * ```
 */

// === Content State Management ===
export {
  contentReducer,
  createInitialContentState,
  selectContentList,
  selectTextContent,
  selectStreamingComponents,
  selectHasActiveTools,
  defaultUiMergeStrategy,
  type ContentState,
  type ContentAction,
} from './content-reducer.ts';

// === React Hooks ===
export {
  useAgentStream,
  useHasActiveTools,
  type UseAgentStreamOptions,
  type UseAgentStreamResult,
} from './use-agent-stream.ts';

// High-level: batteries-included conversation manager
export { AgentConversation } from './AgentConversation.ts';

// Transport: HTTP+SSE transport (optional, use when not using custom WebSocket/etc.)
export {
  AgentTransport,
  type AgentTransportConfig,
  type TransportHeaders,
} from './AgentTransport.ts';

// Mid-level: stateless event processing for custom implementations
export {
  processAgentEvent,
  extractStateUpdate,
  isHiddenSystemTool,
  type ProcessEventResult,
} from './event-processor.ts';

// Low-level: utilities for building custom solutions
export {
  computeMessageGroups,
  getLastGroup,
  getLastResponses,
} from './message-grouper.ts';

// Conversation types
export type {
  ConversationState,
  ConversationStatus,
  ConversationConfig,
  ConversationSnapshot,
  MessageGroup,
  StateListener,
  SystemToolHandler,
  MessageUpsertHandler,
  SnapshotHandler,
  SendParams,
  Attachment,
  AgentMessagePayload,
  ConversationHeaders,
} from './types.ts';

// === Re-export Content Types for UI Development ===
export {
  ContentType,
  type AgentContent,
  type TextContent,
  type ToolContent,
  type ComponentContent,
  type ComponentStreaming,
  type ComponentProps,
  type ToolPartState,
  // Functions
  createTextContent,
  createComponent,
  createStreamingComponent,
  createComponentResult,
  createComponentError,
  toComponentProps,
  isComponentContent,
  isStreamingComponent,
  isComponentLoading,
  isComponentStreaming,
  isComponentDone,
} from '../types/content.ts';

// UI-only Component helpers
export {
  type ComponentView,
  getComponentView,
} from './tool-part-view.ts';

// === Component Hooks ===
export {
  useComponent,
  type UseComponentOptions,
  type UseComponentResult,
} from './use-tool-part.ts';

export {
  useStreamingJson,
  type UseStreamingJsonOptions,
  type UseStreamingJsonResult,
} from './use-streaming-json.ts';

// === Streaming JSON Parser ===
export {
  createStreamingJsonParser,
  type StreamingJsonParser,
  type StreamingJsonState,
} from './streaming-json-parser.ts';

// === Component Props Resolver ===
export {
  ComponentPropsResolver,
  createComponentPropsResolver,
  type ResolvedComponentProps,
} from './component-props-resolver.ts';

// === Stream Utilities ===
export type { UiSink } from '../kernel/ui-sink.ts';
export { mergeContentDeltas, type MergeStrategy } from '../kernel/utils/merge-content-deltas.ts';
export { StreamThrottler } from '../kernel/utils/stream-throttler.ts';

// === Small generic guards (UI-adjacent) ===
export { isPlainObject } from '../kernel/utils/type-guards.ts';
