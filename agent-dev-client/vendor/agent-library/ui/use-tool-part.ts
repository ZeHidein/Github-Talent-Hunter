/**
 * useComponent Hook
 *
 * The primary abstraction for component UI. Combines:
 * - Component state derivation (via getComponentView)
 * - Optional streaming JSON parsing
 * - Convenient boolean helpers
 *
 * Works with both simple UI components and streaming tool components.
 *
 * @example Simple usage (no streaming):
 * ```tsx
 * function MyComponent({ component }) {
 *   const { isLoading, isDone, error } = useComponent({ component });
 *
 *   if (isLoading) return <LoadingIndicator />;
 *   if (error) return <ErrorDisplay error={error} />;
 *   return <Result />;
 * }
 * ```
 *
 * @example With streaming JSON parsing:
 * ```tsx
 * type StreamingFields = { path: string; content: string };
 *
 * function UpdateFileComponent({ component, props }) {
 *   const { isLoading, isStreaming, streaming, isDone } = useComponent<StreamingFields>({
 *     component,
 *     parseStreamingJson: true,
 *   });
 *
 *   // streaming.path available during input-streaming
 *   const displayPath = streaming.path || props.path;
 *
 *   if (isStreaming && streaming.content) {
 *     return <StreamingPreview content={streaming.content} />;
 *   }
 *   if (isLoading) return <LoadingIndicator />;
 *   return <DiffView />;
 * }
 * ```
 */

import { useMemo } from 'react';
import type { ComponentContent } from '../types/content.ts';
import { getComponentView, type ComponentView } from './tool-part-view.ts';
import { useStreamingJson } from './use-streaming-json.ts';

export type UseComponentOptions<
  TStreamingFields extends Record<string, string> = Record<string, string>,
> = {
  /** The component content or streaming data */
  component?: ComponentContent | null;
  /** Parse streaming JSON from inputDelta (default: false) */
  parseStreamingJson?: boolean;
};

export type UseComponentResult<
  TStreamingFields extends Record<string, string> = Record<string, string>,
> = {
  /** Full derived view with all state details */
  view: ComponentView;
  /** Parsed streaming JSON values (empty object if parseStreamingJson=false) */
  streaming: TStreamingFields;
  /** True when component is present */
  isPresent: boolean;
  /** True when loading (input-available or output-pending) */
  isLoading: boolean;
  /** True when streaming input (input-streaming state) */
  isStreaming: boolean;
  /** True when done (output-available or output-error, or no streaming) */
  isDone: boolean;
  /** Error message if present */
  error?: string;
};

/**
 * Hook for component UI to derive state from ComponentContent or streaming data.
 *
 * This is the recommended way to handle component state in UI.
 * It provides:
 * - Normalized boolean helpers for common state checks
 * - Optional streaming JSON parsing for tools that stream structured input
 * - Memoized values to prevent unnecessary re-renders
 */
export function useComponent<
  TStreamingFields extends Record<string, string> = Record<string, string>,
>(options: UseComponentOptions<TStreamingFields> = {}): UseComponentResult<TStreamingFields> {
  const { component, parseStreamingJson = false } = options;

  // Derive view from component
  const view = useMemo(() => getComponentView(component), [component]);

  // Parse streaming JSON if enabled
  const { values: streamingValues } = useStreamingJson<TStreamingFields>({
    inputDelta: view.inputDelta,
    isStreaming: view.isInputStreaming,
    clearOnComplete: view.isDone,
  });

  // Only include streaming values if parsing is enabled
  const streaming = parseStreamingJson ? streamingValues : ({} as TStreamingFields);

  return {
    view,
    streaming,
    isPresent: view.isPresent,
    isLoading: view.isLoading,
    isStreaming: view.isInputStreaming,
    isDone: view.isDone,
    error: view.error,
  };
}
