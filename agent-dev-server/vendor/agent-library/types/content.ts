/**
 * Agent Content Types
 *
 * Canonical content types for the agent runtime.
 * These are plain objects (not classes) for better portability and JSON serialization.
 */

import type { ToolOutput } from './tool-output.ts';

export enum ContentType {
  Text = 'TXT',
  Audio = 'audio',
  Tool = 'Tool',
  Component = 'Component',
}

/**
 * Streaming state machine for tool components.
 * Represents the lifecycle of a tool invocation.
 */
export type ToolPartState =
  | 'input-streaming' // LLM is generating tool arguments
  | 'input-available' // Arguments complete, ready to execute
  | 'output-pending' // Tool is executing
  | 'output-available' // Execution complete, success
  | 'output-error'; // Execution failed

export interface AgentContentBase {
  messageId: string;
  responseId?: string;
  type: ContentType;
  /** Message role - 'user' for user messages, undefined for agent messages */
  role?: 'user';
  /** When true, this content is part of the conversation but should not be rendered in chat UI */
  hidden?: boolean;
}

export interface TextContent extends AgentContentBase {
  type: ContentType.Text;
  content: string;
  isReasoning?: boolean;
}

export interface AudioContent extends AgentContentBase {
  type: ContentType.Audio;
  content: {
    data: string;
    text?: string;
  };
}

export interface ToolContent extends AgentContentBase {
  type: ContentType.Tool;
  tool: {
    name: string;
  };
  content: unknown;
}

/**
 * Streaming state for tool components.
 * Only present for components that go through the tool execution lifecycle.
 */
export interface ComponentStreaming {
  /** Tool name (for identification) */
  toolName: string;

  /** Tool call ID from LLM */
  toolCallId: string;

  /** Current state in lifecycle */
  state: ToolPartState;

  /** Accumulated input delta (during input-streaming) */
  inputDelta?: string;

  /** Parsed tool arguments (after input-available) */
  input?: Record<string, unknown>;

  /**
   * Tool execution result.
   * @deprecated Output is no longer sent to UI to avoid large payloads.
   * Use `props` (from uiProps) for UI-specific data instead.
   * The model receives output via toModelOutput in the runner.
   */
  output?: ToolOutput;

  /** Error message (after output-error) */
  error?: string;
}

/**
 * Unified component content.
 *
 * Used for both simple UI components and streaming tool components.
 * - Simple UI: Just componentName + props
 * - Streaming tool: componentName + props + streaming
 *
 * @example
 * ```typescript
 * // Simple UI (paywall, notification, etc.)
 * createComponent({
 *   messageId,
 *   componentName: 'BuilderPaywall',
 *   props: { reason: 'limit_reached' },
 * });
 *
 * // Streaming tool
 * createComponent({
 *   messageId,
 *   componentName: 'UpdateFile',
 *   props: { path: 'src/Button.tsx' },
 *   streaming: {
 *     toolName: 'UpdateFile',
 *     toolCallId: 'call_123',
 *     state: 'input-streaming',
 *     inputDelta: '{"path":"...',
 *   },
 * });
 * ```
 */
export interface ComponentContent extends AgentContentBase {
  type: ContentType.Component;

  /** UI component name to render */
  componentName: string;

  /** Props for rendering (always available) */
  props: Record<string, unknown>;

  /**
   * Streaming tool lifecycle (optional).
   * Only present for tools with input streaming + execution.
   */
  streaming?: ComponentStreaming;
}

/**
 * @deprecated Use ComponentContent with streaming field instead.
 * Kept for backward compatibility with persisted data.
 */
/**
 * Props passed to component UI for rendering.
 *
 * @example
 * ```tsx
 * function UpdateFile({ component }: { component: ComponentProps }) {
 *   const { isStreaming, isLoading, isDone } = component;
 *
 *   if (isStreaming) return <StreamingPreview delta={component.streaming?.inputDelta} />;
 *   if (isLoading) return <Shimmer />;
 *   if (isDone) return <FilePreview {...component.props} />;
 * }
 * ```
 */
export interface ComponentProps<
  TProps = Record<string, unknown>,
  TInput = Record<string, unknown>,
> {
  componentName: string;
  props: TProps;
  streaming?: ComponentStreaming;

  // Derived state helpers
  isStreaming: boolean;
  isLoading: boolean;
  isDone: boolean;
  hasError: boolean;

  // Convenience accessors
  input?: TInput;
  output?: ToolOutput;
  error?: string;
}

/**
 * Transform ComponentContent to ComponentProps for UI rendering.
 */
export function toComponentProps<
  TProps = Record<string, unknown>,
  TInput = Record<string, unknown>,
>(content: ComponentContent): ComponentProps<TProps, TInput> {
  const s = content.streaming;
  return {
    componentName: content.componentName,
    props: content.props as TProps,
    streaming: s,

    // Derived state
    isStreaming: s?.state === 'input-streaming',
    isLoading: s?.state === 'input-available' || s?.state === 'output-pending',
    isDone: !s || s.state === 'output-available' || s.state === 'output-error',
    hasError: s?.state === 'output-error',

    // Convenience accessors
    input: s?.input as TInput | undefined,
    output: s?.output,
    error: s?.error,
  };
}

/**
 * Check if component is in a loading state.
 */
export function isComponentLoading(content: ComponentContent): boolean {
  const state = content.streaming?.state;
  return state === 'input-available' || state === 'output-pending';
}

/**
 * Check if component is streaming input.
 */
export function isComponentStreaming(content: ComponentContent): boolean {
  return content.streaming?.state === 'input-streaming';
}

/**
 * Check if component is done (no streaming, or streaming complete).
 */
export function isComponentDone(content: ComponentContent): boolean {
  const s = content.streaming;
  return !s || s.state === 'output-available' || s.state === 'output-error';
}

export type AgentContent = TextContent | AudioContent | ToolContent | ComponentContent;

// ============================================================================
// Factory Functions
// ============================================================================

export function createTextContent(params: {
  messageId: string;
  responseId?: string;
  content: string;
  isReasoning?: boolean;
  role?: 'user';
  hidden?: boolean;
}): TextContent {
  return {
    type: ContentType.Text,
    messageId: params.messageId,
    responseId: params.responseId,
    content: params.content,
    isReasoning: params.isReasoning,
    role: params.role,
    hidden: params.hidden,
  };
}

export function createAudioContent(params: {
  messageId: string;
  responseId?: string;
  content: { data: string; text?: string };
  role?: 'user';
}): AudioContent {
  return {
    type: ContentType.Audio,
    messageId: params.messageId,
    responseId: params.responseId,
    content: params.content,
    role: params.role,
  };
}

export function createToolContent(params: {
  messageId: string;
  responseId?: string;
  tool: { name: string };
  content: unknown;
}): ToolContent {
  return {
    type: ContentType.Tool,
    messageId: params.messageId,
    responseId: params.responseId,
    tool: params.tool,
    content: params.content,
  };
}

/**
 * Create a component content.
 *
 * @example
 * ```typescript
 * // Simple UI
 * createComponent({
 *   messageId,
 *   componentName: 'BuilderPaywall',
 * });
 *
 * // With props
 * createComponent({
 *   messageId,
 *   componentName: 'Notification',
 *   props: { message: 'Hello' },
 * });
 *
 * // Streaming tool
 * createComponent({
 *   messageId,
 *   componentName: 'UpdateFile',
 *   props: { path: 'src/foo.ts' },
 *   streaming: {
 *     toolName: 'UpdateFile',
 *     toolCallId: 'call_123',
 *     state: 'input-streaming',
 *   },
 * });
 * ```
 */
export function createComponent(params: {
  messageId: string;
  responseId?: string;
  componentName: string;
  props?: Record<string, unknown>;
  streaming?: ComponentStreaming;
}): ComponentContent {
  return {
    type: ContentType.Component,
    messageId: params.messageId,
    responseId: params.responseId,
    componentName: params.componentName,
    props: params.props ?? {},
    streaming: params.streaming,
  };
}

/**
 * Create a streaming tool component in input-streaming state.
 */
export function createStreamingComponent(params: {
  messageId: string;
  responseId?: string;
  componentName: string;
  toolName: string;
  toolCallId: string;
  inputDelta?: string;
  props?: Record<string, unknown>;
}): ComponentContent {
  return createComponent({
    messageId: params.messageId,
    responseId: params.responseId,
    componentName: params.componentName,
    props: params.props,
    streaming: {
      toolName: params.toolName,
      toolCallId: params.toolCallId,
      state: 'input-streaming',
      inputDelta: params.inputDelta ?? '',
    },
  });
}

/**
 * Create a streaming tool component in output-available state.
 *
 * Note: `output` is no longer sent to UI to avoid large payloads.
 * Use `props` for UI-specific data instead.
 */
export function createComponentResult(params: {
  messageId: string;
  responseId?: string;
  componentName: string;
  toolName: string;
  toolCallId: string;
  input: Record<string, unknown>;
  props?: Record<string, unknown>;
}): ComponentContent {
  return createComponent({
    messageId: params.messageId,
    responseId: params.responseId,
    componentName: params.componentName,
    props: params.props,
    streaming: {
      toolName: params.toolName,
      toolCallId: params.toolCallId,
      state: 'output-available',
      input: params.input,
    },
  });
}

/**
 * Create a streaming tool component in output-error state.
 */
export function createComponentError(params: {
  messageId: string;
  responseId?: string;
  componentName: string;
  toolName: string;
  toolCallId: string;
  input?: Record<string, unknown>;
  error: string;
  props?: Record<string, unknown>;
}): ComponentContent {
  return createComponent({
    messageId: params.messageId,
    responseId: params.responseId,
    componentName: params.componentName,
    props: params.props,
    streaming: {
      toolName: params.toolName,
      toolCallId: params.toolCallId,
      state: 'output-error',
      input: params.input,
      error: params.error,
    },
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a shallow copy of content (for immutable updates).
 */
export function copyContent<T extends AgentContent>(content: T): T {
  if (content.type === ContentType.Text) {
    return { ...content } as T;
  }
  if (content.type === ContentType.Audio) {
    return { ...content, content: { ...content.content } } as T;
  }
  if (content.type === ContentType.Tool) {
    return { ...content, tool: { ...content.tool } } as T;
  }
  if (content.type === ContentType.Component) {
    const comp = content as ComponentContent;
    return {
      ...comp,
      props: { ...comp.props },
      streaming: comp.streaming
        ? {
            ...comp.streaming,
            input: comp.streaming.input ? { ...comp.streaming.input } : undefined,
          }
        : undefined,
    } as T;
  }
  return { ...content } as T;
}

/**
 * Type guard for ComponentContent.
 */
export function isComponentContent(content: AgentContent): content is ComponentContent {
  return content.type === ContentType.Component;
}

/**
 * Type guard for streaming ComponentContent.
 */
export function isStreamingComponent(
  content: AgentContent,
): content is ComponentContent & { streaming: ComponentStreaming } {
  return content.type === ContentType.Component && !!(content as ComponentContent).streaming;
}

/**
 * Check if content is a streaming delta that should be skipped for storage.
 * Only final states (output-available, output-error) should be stored.
 */
export function isStreamingDelta(content: AgentContent): boolean {
  if (content.type !== ContentType.Component) return false;
  const streaming = (content as ComponentContent).streaming;
  if (!streaming) return false;
  return (
    streaming.state === 'input-streaming' ||
    streaming.state === 'input-available' ||
    streaming.state === 'output-pending'
  );
}

/**
 * Type guard for user messages.
 */
export function isUserContent(content: AgentContent): boolean {
  return content.role === 'user';
}
