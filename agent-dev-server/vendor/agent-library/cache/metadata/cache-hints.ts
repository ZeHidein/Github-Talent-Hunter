/**
 * Cache integration metadata that travels with messages through the middleware pipeline.
 * Set by truncation middleware, read by cache middleware, removed before LLM call.
 */

const CACHE_HINT_KEY = '__cacheHint';

export type CacheHintMetadata = {
  /**
   * Message is "stable" - its content won't change on subsequent truncation runs.
   * Safe to place a cache point on this message.
   */
  stable: boolean;
  /**
   * Reason why this message is stable (for debugging).
   */
  reason?:
    | 'user'
    | 'system'
    | 'text-only'
    | 'already-truncated'
    | 'preserved-tool'
    | 'tool-call-only';
};

/**
 * Add cache hint metadata to a message's providerOptions.
 * Called by truncation middleware after processing.
 */
export function setCacheHint(
  message: { providerOptions?: Record<string, unknown> },
  hint: CacheHintMetadata,
): void {
  const options = message.providerOptions ?? {};
  (message as { providerOptions: Record<string, unknown> }).providerOptions = {
    ...options,
    [CACHE_HINT_KEY]: hint,
  };
}

/**
 * Get cache hint metadata from a message's providerOptions.
 * Called by cache strategy to determine where to place cache points.
 */
export function getCacheHint(message: {
  providerOptions?: Record<string, unknown>;
}): CacheHintMetadata | undefined {
  return message.providerOptions?.[CACHE_HINT_KEY] as CacheHintMetadata | undefined;
}

/**
 * Check if a message is marked as stable for caching.
 */
export function isMessageStable(message: { providerOptions?: Record<string, unknown> }): boolean {
  return getCacheHint(message)?.stable === true;
}

/**
 * Remove cache hint metadata from a message.
 * Called before sending to LLM to avoid confusing the provider.
 */
export function removeCacheHint(message: { providerOptions?: Record<string, unknown> }): void {
  if (message.providerOptions?.[CACHE_HINT_KEY]) {
    const { [CACHE_HINT_KEY]: _, ...rest } = message.providerOptions;
    if (Object.keys(rest).length === 0) {
      delete (message as { providerOptions?: Record<string, unknown> }).providerOptions;
    } else {
      (message as { providerOptions: Record<string, unknown> }).providerOptions = rest;
    }
  }
}

/**
 * Remove cache hints from all messages in a prompt.
 * Called before sending to LLM.
 */
export function removeCacheHintsFromPrompt<T extends { providerOptions?: Record<string, unknown> }>(
  messages: T[],
): T[] {
  for (const message of messages) {
    removeCacheHint(message);
  }
  return messages;
}
