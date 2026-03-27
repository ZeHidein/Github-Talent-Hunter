import { APICallError } from '@ai-sdk/provider';
import type { CheckpointPolicy, RetryPolicy, StopPolicy, TurnPolicy } from '../kernel/policies.ts';

/**
 * Default stop policy - no automatic stopping at tool names.
 * Override this in application code to stop at specific tools (e.g., component tools).
 */
export const stopPolicy: StopPolicy = () => ({});

export const retryPolicy: RetryPolicy = ({ error, retries, maxRetries }) => {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';

  if (retries >= maxRetries) {
    return {
      shouldRetry: false,
      delayMs: 0,
      userMessage: 'I have already performed too many retries to complete the task.',
    };
  }

  if (message.includes('Overloaded') || message.includes('limit')) {
    return {
      shouldRetry: false,
      delayMs: 0,
      userMessage:
        'Sorry, but the selected model is overloaded. Please try again in a few minutes or select a different model.',
    };
  }

  if (message.includes('too long')) {
    return {
      shouldRetry: true,
      delayMs: 0,
      triggerTruncation: true,
    };
  }

  if (message.includes('terminated')) {
    return { shouldRetry: true, delayMs: 1000 };
  }

  if (error instanceof APICallError) {
    if (error.isRetryable) {
      return { shouldRetry: true, delayMs: 1000 };
    }
    return {
      shouldRetry: false,
      delayMs: 0,
      userMessage: 'Sorry, an error occurred while processing your request. Please try again.',
    };
  }

  return { shouldRetry: false, delayMs: 0, userMessage: 'An unexpected error occurred.' };
};

export const checkpointPolicy: CheckpointPolicy = () => ({ shouldEmitStateUpdate: true });

/**
 * Default behavior: stop after a single turn.
 */
export const turnPolicy: TurnPolicy = async () => ({ shouldStop: true });

export const policies = {
  stop: stopPolicy,
  retry: retryPolicy,
  checkpoint: checkpointPolicy,
  turn: turnPolicy,
} satisfies {
  stop: StopPolicy;
  retry: RetryPolicy;
  checkpoint: CheckpointPolicy;
  turn: TurnPolicy;
};
