/**
 * useStreamingJson Hook
 *
 * React hook for parsing streaming JSON from tool input deltas.
 * Wraps the streaming JSON parser with React state management.
 *
 * @example
 * ```tsx
 * type Fields = { path: string; content: string };
 *
 * function MyComponent({ toolPart }) {
 *   const { values } = useStreamingJson<Fields>({
 *     inputDelta: toolPart?.inputDelta ?? '',
 *     isStreaming: toolPart?.state === 'input-streaming',
 *   });
 *
 *   return <div>Path: {values.path}</div>;
 * }
 * ```
 */

import { useRef, useState, useEffect } from 'react';
import { createStreamingJsonParser, type StreamingJsonParser } from './streaming-json-parser.ts';

export type UseStreamingJsonOptions = {
  /** The accumulated input delta buffer to parse */
  inputDelta: string;
  /** Whether streaming is currently active */
  isStreaming: boolean;
  /** Reset parser when this changes to true (e.g., when tool completes) */
  clearOnComplete?: boolean;
};

export type UseStreamingJsonResult<T extends Record<string, string> = Record<string, string>> = {
  /** Parsed key-value pairs from the streaming JSON */
  values: T;
  /** Raw buffer for debugging */
  buffer: string;
};

/**
 * Parse streaming JSON from tool input deltas.
 *
 * This hook manages a streaming JSON parser instance and feeds it
 * new content as the inputDelta grows. It handles:
 * - Incremental parsing (only processes new content)
 * - Stream resets (detects when a new stream starts)
 * - Cleanup when streaming completes
 *
 * @param options Configuration options
 * @returns Parsed values and buffer
 */
export function useStreamingJson<T extends Record<string, string> = Record<string, string>>(
  options: UseStreamingJsonOptions,
): UseStreamingJsonResult<T> {
  const { inputDelta, clearOnComplete = false } = options;

  const parserRef = useRef<StreamingJsonParser | null>(null);
  const lastFedLengthRef = useRef(0);
  const lastBufferRef = useRef<string>('');
  const [values, setValues] = useState<T>({} as T);

  // Initialize parser once
  useEffect(() => {
    parserRef.current = createStreamingJsonParser();
    return () => {
      parserRef.current?.reset();
    };
  }, []);

  // Feed content to parser when inputDelta changes
  useEffect(() => {
    const buffer = inputDelta || '';

    if (!parserRef.current) {
      return;
    }

    // If buffer is shorter or different prefix, it's a new stream - reset parser
    if (
      buffer.length < lastFedLengthRef.current ||
      !buffer.startsWith(
        lastBufferRef.current.slice(0, Math.min(lastBufferRef.current.length, buffer.length)),
      )
    ) {
      parserRef.current.reset();
      lastFedLengthRef.current = 0;
    }

    // Feed new content
    if (buffer.length > lastFedLengthRef.current) {
      const newContent = buffer.slice(lastFedLengthRef.current);
      parserRef.current.feed(newContent);
      lastFedLengthRef.current = buffer.length;

      // Update values
      setValues(parserRef.current.getValues() as T);
    }

    lastBufferRef.current = buffer;
  }, [inputDelta]);

  // Clear values when explicitly requested (when tool completes)
  useEffect(() => {
    if (clearOnComplete && parserRef.current) {
      lastFedLengthRef.current = 0;
      lastBufferRef.current = '';
      parserRef.current.reset();
      setValues({} as T);
    }
  }, [clearOnComplete]);

  return {
    values,
    buffer: parserRef.current?.getBuffer() ?? '',
  };
}
