import type { ToolPartState, ComponentContent, ComponentStreaming } from '../types/content.ts';

/**
 * Generic derived view of a component for UI rendering.
 *
 * This stays in `/ui` (not `/types`) on purpose: it's a convenience wrapper
 * for rendering logic and should not be mixed with the canonical content model.
 */
export type ComponentView = {
  /** Whether a component was provided at all */
  isPresent: boolean;
  /** Current streaming state (null when no streaming) */
  state: ToolPartState | null;
  /** True when the model is still streaming tool input */
  isInputStreaming: boolean;
  /** True when the tool is "loading" (input-streaming, input-available, or output-pending) */
  isLoading: boolean;
  /** True when the tool has finished (output-available or output-error) or no streaming */
  isDone: boolean;
  /** Normalized accumulated input buffer (always a string) */
  inputDelta: string;
  /** Error message when available */
  error?: string;
};

/**
 * Accepts ComponentContent, ComponentStreaming, or any object with state/inputDelta/error.
 * This allows flexibility for both library types and app-owned types.
 */
/**
 * Extract view state from component content or streaming data.
 */
export function getComponentView(component?: ComponentContent | null): ComponentView {
  // Handle null/undefined
  if (!component) {
    return {
      isPresent: false,
      state: null,
      isInputStreaming: false,
      isLoading: false,
      isDone: true,
      inputDelta: '',
    };
  }

  const streaming = component.streaming;
  if (!streaming) {
    // Simple component without streaming - always "done"
    return {
      isPresent: true,
      state: null,
      isInputStreaming: false,
      isLoading: false,
      isDone: true,
      inputDelta: '',
    };
  }
  return getStreamingView(streaming);
}

function getStreamingView(
  streaming: Pick<ComponentStreaming, 'state' | 'inputDelta' | 'error'>,
): ComponentView {
  const state = streaming.state ?? null;
  const inputDelta = typeof streaming.inputDelta === 'string' ? streaming.inputDelta : '';
  const error = typeof streaming.error === 'string' ? streaming.error : undefined;

  return {
    isPresent: true,
    state,
    isInputStreaming: state === 'input-streaming',
    isLoading:
      state === 'input-streaming' || state === 'input-available' || state === 'output-pending',
    isDone: state === 'output-available' || state === 'output-error',
    inputDelta,
    error,
  };
}
