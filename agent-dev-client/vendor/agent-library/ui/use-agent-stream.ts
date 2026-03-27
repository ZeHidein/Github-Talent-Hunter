/**
 * React hooks for consuming agent streams.
 *
 * Note: This file requires React as a peer dependency.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { AgentContent } from '../types/content.ts';
import type { CancelableStream } from '../types/cancelable-stream.ts';
import {
  contentReducer,
  createInitialContentState,
  selectContentList,
  selectTextContent,
  selectHasActiveTools,
  type ContentState,
} from './content-reducer.ts';

export interface UseAgentStreamOptions {
  /** Called when stream ends */
  onComplete?: () => void;
  /** Called on stream error */
  onError?: (error: unknown) => void;
}

export interface UseAgentStreamResult {
  /** Current content state */
  state: ContentState;
  /** All content items in order */
  contents: AgentContent[];
  /** Concatenated text content */
  text: string;
  /** Whether stream is currently active */
  isStreaming: boolean;
  /** Whether stream has completed */
  isComplete: boolean;
  /** Any error that occurred */
  error: unknown | null;
  /** Start consuming a stream */
  start: (stream: CancelableStream<AgentContent>) => void;
  /** Cancel the current stream */
  cancel: () => void;
  /** Reset state */
  reset: () => void;
}

/**
 * React hook for consuming agent content streams.
 *
 * @example
 * ```tsx
 * function ChatComponent() {
 *   const { contents, isStreaming, start, cancel } = useAgentStream();
 *
 *   const handleSubmit = async (message: string) => {
 *     const stream = await agent.run(message);
 *     start(stream);
 *   };
 *
 *   return (
 *     <div>
 *       {contents.map((content) => (
 *         <ContentRenderer key={content.messageId} content={content} />
 *       ))}
 *       {isStreaming && <button onClick={cancel}>Stop</button>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useAgentStream(options: UseAgentStreamOptions = {}): UseAgentStreamResult {
  const { onComplete, onError } = options;

  const [state, dispatch] = useReducer(contentReducer, undefined, createInitialContentState);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<unknown | null>(null);

  const streamRef = useRef<CancelableStream<AgentContent> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.abort();
      streamRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const reset = useCallback(() => {
    cancel();
    dispatch({ type: 'reset' });
    setError(null);
  }, [cancel]);

  const start = useCallback(
    (stream: CancelableStream<AgentContent>) => {
      // Cancel any existing stream
      cancel();

      streamRef.current = stream;
      abortControllerRef.current = new AbortController();
      setIsStreaming(true);
      setError(null);

      const consume = async () => {
        try {
          for await (const content of stream) {
            if (abortControllerRef.current?.signal.aborted) {
              break;
            }
            dispatch({ type: 'append', content });
          }
          dispatch({ type: 'stream-end' });
          onComplete?.();
        } catch (err) {
          setError(err);
          onError?.(err);
        } finally {
          setIsStreaming(false);
          streamRef.current = null;
        }
      };

      consume();
    },
    [cancel, onComplete, onError],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  return {
    state,
    contents: selectContentList(state),
    text: selectTextContent(state),
    isStreaming,
    isComplete: state.isComplete,
    error,
    start,
    cancel,
    reset,
  };
}

/**
 * Selector hooks for derived state.
 */
export function useHasActiveTools(state: ContentState) {
  return selectHasActiveTools(state);
}
