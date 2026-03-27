/**
 * Agent Library Re-exports
 *
 * Barrel file that re-exports types and utilities from the local vendor agent-library.
 * The browser vendor contains only browser-safe files (UI, types, utilities).
 */

// Re-export everything from the UI module (browser-safe)
export {
  // Content Types
  ContentType,
  type AgentContent,
  type AgentMessagePayload,
  type TextContent,
  type ToolContent,
  type ComponentContent,
  type ComponentStreaming,
  type ComponentProps,
  type ToolPartState,
  // Content Utilities
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
  // UI Types
  AgentConversation,
  type ConversationState,
  type ConversationStatus,
  type MessageGroup,
  // Message Grouping
  computeMessageGroups,
  getLastGroup,
  getLastResponses,
  // Content Reducer
  contentReducer,
  createInitialContentState,
  selectContentList,
  selectTextContent,
  selectStreamingComponents,
  selectHasActiveTools,
  defaultUiMergeStrategy,
  type ContentState,
  type ContentAction,
  // Component View Helpers
  type ComponentView,
  getComponentView,
  // Streaming JSON Parser
  createStreamingJsonParser,
  type StreamingJsonParser,
  // Component Props Resolver
  ComponentPropsResolver,
  createComponentPropsResolver,
  type ResolvedComponentProps,
  // Generic guards
  isPlainObject,
} from '../../vendor/agent-library/ui/index.ts';

// Streaming utilities (browser-safe)
export {
  RetryLoop,
  type RetryLoopDeps,
  type RetryLoopOptions,
} from '../../vendor/agent-library/streaming/retry-loop.ts';
