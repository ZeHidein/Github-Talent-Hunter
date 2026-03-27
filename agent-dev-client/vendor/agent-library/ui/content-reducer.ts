import {
  ContentType,
  type AgentContent,
  type TextContent,
  type ComponentContent,
  isStreamingComponent,
} from '../types/content.ts';
import type { MergeStrategy } from '../kernel/utils/merge-content-deltas.ts';

/**
 * UI content state shape.
 * Maps messageId -> content for efficient updates.
 */
export interface ContentState {
  /** All content items indexed by messageId */
  byId: Map<string, AgentContent>;
  /** Ordered list of messageIds for rendering */
  order: string[];
  /** Whether the stream has ended */
  isComplete: boolean;
}

/**
 * Actions for the content reducer.
 */
export type ContentAction =
  | { type: 'append'; content: AgentContent }
  | { type: 'append-batch'; contents: AgentContent[] }
  | {
      type: 'update-streaming-component';
      toolCallId: string;
      updates: Partial<ComponentContent['streaming']>;
    }
  | { type: 'stream-end' }
  | { type: 'reset' };

/**
 * Creates an empty content state.
 */
export function createInitialContentState(): ContentState {
  return {
    byId: new Map(),
    order: [],
    isComplete: false,
  };
}

/**
 * Default merge strategy for UI content.
 * Merges text deltas and accumulates component streaming input.
 */
export const defaultUiMergeStrategy: MergeStrategy = {
  shouldMerge: (prev: AgentContent, next: AgentContent): boolean => {
    // Merge consecutive text content
    if (prev.type === ContentType.Text && next.type === ContentType.Text) {
      return prev.messageId === next.messageId;
    }
    // Merge streaming component updates
    if (isStreamingComponent(prev) && isStreamingComponent(next)) {
      return prev.streaming.toolCallId === next.streaming.toolCallId;
    }
    return false;
  },
  merge: (prev: AgentContent, next: AgentContent): AgentContent => {
    if (prev.type === ContentType.Text && next.type === ContentType.Text) {
      return {
        ...prev,
        content: prev.content + next.content,
      } as TextContent;
    }
    if (isStreamingComponent(prev) && isStreamingComponent(next)) {
      // Merge streaming state
      const mergedStreaming = {
        ...prev.streaming,
        ...next.streaming,
        // Accumulate inputDelta
        inputDelta: (prev.streaming.inputDelta || '') + (next.streaming.inputDelta || ''),
        // Prefer new values, fallback to existing
        input: next.streaming.input ?? prev.streaming.input,
        error: next.streaming.error ?? prev.streaming.error,
      };

      return {
        ...prev,
        ...next,
        props: { ...prev.props, ...next.props },
        streaming: mergedStreaming,
      } as ComponentContent;
    }
    return next;
  },
};

/**
 * Reducer for managing content state.
 * Can be used with React's useReducer or any state management library.
 *
 * @example
 * ```typescript
 * const [state, dispatch] = useReducer(contentReducer, createInitialContentState());
 *
 * // In stream handler:
 * for await (const content of stream) {
 *   dispatch({ type: 'append', content });
 * }
 * dispatch({ type: 'stream-end' });
 * ```
 */
export function contentReducer(state: ContentState, action: ContentAction): ContentState {
  switch (action.type) {
    case 'append': {
      const { content } = action;
      const existing = state.byId.get(content.messageId);

      if (existing && defaultUiMergeStrategy.shouldMerge(existing, content)) {
        // Merge with existing content
        const merged = defaultUiMergeStrategy.merge(existing, content);
        const newById = new Map(state.byId);
        newById.set(content.messageId, merged);
        return { ...state, byId: newById };
      }

      // Add new content
      const newById = new Map(state.byId);
      newById.set(content.messageId, content);
      const newOrder = state.order.includes(content.messageId)
        ? state.order
        : [...state.order, content.messageId];

      return { ...state, byId: newById, order: newOrder };
    }

    case 'append-batch': {
      let newState = state;
      for (const content of action.contents) {
        newState = contentReducer(newState, { type: 'append', content });
      }
      return newState;
    }

    case 'update-streaming-component': {
      const { toolCallId, updates } = action;
      // Find the streaming component by toolCallId
      for (const [messageId, content] of state.byId) {
        if (isStreamingComponent(content) && content.streaming.toolCallId === toolCallId) {
          const newById = new Map(state.byId);
          newById.set(messageId, {
            ...content,
            streaming: { ...content.streaming, ...updates },
          });
          return { ...state, byId: newById };
        }
      }
      return state;
    }

    case 'stream-end':
      return { ...state, isComplete: true };

    case 'reset':
      return createInitialContentState();

    default:
      return state;
  }
}

/**
 * Selects content items in render order.
 *
 * Converts the Map-based state into an ordered array for rendering.
 *
 * @param state - The content state from useReducer or state management
 * @returns Ordered array of content items
 *
 * @example
 * ```tsx
 * const contents = selectContentList(state);
 * return contents.map(content => <ContentRenderer key={content.messageId} content={content} />);
 * ```
 */
export function selectContentList(state: ContentState): AgentContent[] {
  return state.order.map((id) => state.byId.get(id)!).filter(Boolean);
}

/**
 * Selects all text content concatenated into a single string.
 *
 * Useful for extracting the full text response from a stream.
 *
 * @param state - The content state
 * @returns Concatenated text from all TextContent items
 *
 * @example
 * ```typescript
 * const fullText = selectTextContent(state);
 * console.log('Agent said:', fullText);
 * ```
 */
export function selectTextContent(state: ContentState): string {
  return selectContentList(state)
    .filter((c): c is TextContent => c.type === ContentType.Text)
    .map((c) => c.content)
    .join('');
}

/**
 * Selects all streaming components (tools with streaming state).
 *
 * Returns only ComponentContent items that have a `streaming` property,
 * representing tool calls in progress.
 *
 * @param state - The content state
 * @returns Array of streaming component contents
 *
 * @example
 * ```typescript
 * const tools = selectStreamingComponents(state);
 * const pendingTools = tools.filter(t => t.streaming.state === 'output-pending');
 * ```
 */
export function selectStreamingComponents(
  state: ContentState,
): (ComponentContent & { streaming: NonNullable<ComponentContent['streaming']> })[] {
  return selectContentList(state).filter(isStreamingComponent);
}

/**
 * Checks if any tool is currently executing (streaming input or awaiting output).
 *
 * Useful for disabling UI elements while tools are running.
 *
 * @param state - The content state
 * @returns true if any tool is in 'input-streaming' or 'output-pending' state
 *
 * @example
 * ```tsx
 * const hasActiveTools = selectHasActiveTools(state);
 * return <button disabled={hasActiveTools}>Send</button>;
 * ```
 */
export function selectHasActiveTools(state: ContentState): boolean {
  return selectStreamingComponents(state).some(
    (c) => c.streaming.state === 'input-streaming' || c.streaming.state === 'output-pending',
  );
}
