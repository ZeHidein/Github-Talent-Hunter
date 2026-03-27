import type { LanguageModelUsage } from 'ai';

/**
 * Cache/token usage helpers.
 *
 * Motivation: token accounting is provider-specific behavior and should not live in `AgentState`.
 */

function finiteNonNegative(n: number | undefined): number | undefined {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    return undefined;
  }
  return n >= 0 ? n : undefined;
}

function finiteNonNegativeOr0(n: number | undefined): number {
  return finiteNonNegative(n) ?? 0;
}

export function getCacheReadInputTokens(usage: LanguageModelUsage | null | undefined): number {
  return finiteNonNegativeOr0(usage?.inputTokenDetails?.cacheReadTokens);
}

export function getCacheWriteInputTokens(usage: LanguageModelUsage | null | undefined): number {
  return finiteNonNegativeOr0(usage?.inputTokenDetails?.cacheWriteTokens);
}

/**
 * Cached input tokens (read + write).
 */
export function getCachedInputTokens(usage: LanguageModelUsage | null | undefined): number {
  return getCacheReadInputTokens(usage) + getCacheWriteInputTokens(usage);
}

export function getLogicalPromptInputTokens(usage: LanguageModelUsage | null | undefined): number {
  const inputTokens = usage?.inputTokens ?? 0;
  return inputTokens;
}

/**
 * "Prompt pressure" tokens used for triggering truncation behavior.
 *
 * Prefer `getLogicalPromptInputTokens`. Fall back to `usage.totalTokens` when needed.
 */
export function getPromptPressureTokens(
  usage: LanguageModelUsage | null | undefined,
): number | undefined {
  const logical = getLogicalPromptInputTokens(usage);
  if (logical > 0) {
    return logical;
  }
  return finiteNonNegative(usage?.totalTokens);
}
