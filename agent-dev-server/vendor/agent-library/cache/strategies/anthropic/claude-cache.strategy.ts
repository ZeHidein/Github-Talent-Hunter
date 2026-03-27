import type {
  LanguageModelV3Message,
  LanguageModelV3Prompt,
  LanguageModelV3ToolCallPart,
  LanguageModelV3ToolResultPart,
} from '@ai-sdk/provider';
import { AbstractCacheStrategy } from '../abstract-cache.strategy.ts';
import {
  TRUNCATION_MARKER_PREFIXES,
  TRUNCATION_ARRAY_MARKER_REGEX,
  TRUNCATION_OBJECT_MARKER_KEY,
} from '../../../defaults/middlewares/tool-payload-truncation.config.ts';
import { safeJsonStringify } from '../../../kernel/utils/json.ts';
import { getCacheHint, isMessageStable } from '../../metadata/cache-hints.ts';

const MAX_CACHE_BREAKPOINTS = 4;

export type ClaudeCacheStrategyConfig = {
  /** Function to check if a model ID belongs to Anthropic/Claude */
  isClaudeModel?: (modelId: string) => boolean;
  /**
   * Strategy for placing cache points with truncation awareness.
   *
   * - 'balanced' (default): Reserve 1 slot for stable content (already truncated),
   *   use remaining slots for latest assistants. This ensures cache survives
   *   after truncation kicks in.
   *
   * - 'latest-only': Original behavior - cache only on latest assistant messages.
   *   Cache will be invalidated when truncation modifies content.
   *
   * - 'stable-only': Only cache content that's already been truncated.
   *   No cache until truncation happens (poor initial cache utilization).
   */
  cacheStrategy?: 'balanced' | 'latest-only' | 'stable-only';
};

/**
 * Cache strategy for Anthropic Claude models via direct API.
 *
 * Applies ephemeral cache control markers (5m TTL) to up to 4 breakpoints.
 *
 * **Balanced Strategy (default):**
 * - Slot 1: System message (always stable)
 * - Slot 2: Last already-truncated assistant (stable after truncation)
 * - Slots 3-4: Latest assistant messages (normal behavior)
 *
 * This ensures cache survives truncation:
 * - Before truncation: System + latest assistants cached
 * - After truncation: System + truncated assistant remain cached
 *
 * @example
 * ```typescript
 * const strategy = new ClaudeCacheStrategy();
 *
 * // Or with specific strategy:
 * const strategy = new ClaudeCacheStrategy({
 *   cacheStrategy: 'latest-only', // Original behavior
 * });
 * ```
 */
export class ClaudeCacheStrategy extends AbstractCacheStrategy {
  protected supportedProviders = ['anthropic'];
  #isClaudeModel: (modelId: string) => boolean;
  #cacheStrategy: 'balanced' | 'latest-only' | 'stable-only';

  constructor(config: ClaudeCacheStrategyConfig = {}) {
    super();
    this.#isClaudeModel =
      config.isClaudeModel ?? ((modelId) => modelId.toLowerCase().includes('claude'));
    this.#cacheStrategy = config.cacheStrategy ?? 'balanced';
  }

  canHandle(modelId: string | undefined, aiSdkProvider: string | undefined): boolean {
    if (!aiSdkProvider || !modelId) {
      return false;
    }
    if (!this.supportedProviders.includes(aiSdkProvider)) {
      return false;
    }
    return this.#isClaudeModel(modelId);
  }

  applyCaching(prompt: LanguageModelV3Prompt): LanguageModelV3Prompt {
    if (prompt.length === 0) {
      return prompt;
    }

    const clonedMessages = JSON.parse(JSON.stringify(prompt)) as LanguageModelV3Message[];

    // Clear existing cache control markers
    for (const m of clonedMessages) {
      if (m.providerOptions?.anthropic?.cacheControl) {
        delete (m.providerOptions as Record<string, unknown>).anthropic;
      }
    }

    const breakpoints = this.selectCacheBreakpoints(clonedMessages);

    for (const idx of breakpoints) {
      this.applyCacheControl(clonedMessages[idx]);
      this.getLogger().debug(
        `[${this.getName()}] Applied cache_control at index ${idx} (role: ${clonedMessages[idx].role})`,
      );
    }

    return clonedMessages;
  }

  /**
   * Select which message indices should have cache breakpoints.
   */
  private selectCacheBreakpoints(messages: LanguageModelV3Message[]): number[] {
    const systemIdx = messages.findIndex((m) => m.role === 'system');

    // Find first user message after system (NEVER truncated - always stable)
    // Can also check cache hint for confirmation
    const firstUserIdx = messages.findIndex((m, i) => {
      if (m.role !== 'user' || i <= (systemIdx ?? -1)) {
        return false;
      }
      // If hint is available and says unstable, skip (should never happen for user)
      const hint = getCacheHint(m);
      if (hint && !hint.stable) {
        return false;
      }
      return true;
    });

    // Find all valid assistant indices (excluding reasoning endings)
    const allAssistantIndices = messages
      .map((m, i) => {
        if (m.role !== 'assistant') {
          return -1;
        }
        if (this.hasEndsWithReasoningContent(m)) {
          this.getLogger().debug(
            `[${this.getName()}] Skipping assistant at index ${i} - ends with reasoning`,
          );
          return -1;
        }
        return i;
      })
      .filter((i) => i !== -1);

    // Categorize assistants by stability
    // First check cache hints from truncation middleware, fallback to heuristics
    const stableAssistants: number[] = []; // Already truncated or marked stable
    const unstableAssistants: number[] = []; // Not yet truncated (has tool parts)
    const textOnlyAssistants: number[] = []; // No tool parts (inherently stable)

    for (const idx of allAssistantIndices) {
      const msg = messages[idx];
      const hint = getCacheHint(msg);

      // If truncation middleware provided a hint, use it
      if (hint) {
        if (hint.stable) {
          if (hint.reason === 'text-only') {
            textOnlyAssistants.push(idx);
          } else {
            stableAssistants.push(idx);
          }
        } else {
          unstableAssistants.push(idx);
        }
        continue;
      }

      // Fallback: use heuristics if no hint available
      const hasTools = this.#hasToolParts(msg);
      const isTruncated = hasTools ? this.isMessageAlreadyTruncated(msg) : false;

      if (!hasTools) {
        textOnlyAssistants.push(idx);
      } else if (isTruncated) {
        stableAssistants.push(idx);
      } else {
        unstableAssistants.push(idx);
      }
    }

    // Log summary instead of per-message
    this.getLogger().debug(
      `[${this.getName()}] Assistants: stable=[${stableAssistants.join(',')}] text=[${textOnlyAssistants.join(',')}] unstable=[${unstableAssistants.join(',')}]`,
    );

    const breakpoints: number[] = [];

    // Always cache system message (slot 1)
    if (systemIdx !== -1) {
      breakpoints.push(systemIdx);
    }

    const remainingSlots = MAX_CACHE_BREAKPOINTS - breakpoints.length;
    if (remainingSlots <= 0) {
      return breakpoints;
    }

    if (this.#cacheStrategy === 'latest-only') {
      // Original behavior: just use latest assistants
      breakpoints.push(...allAssistantIndices.slice(-remainingSlots));
    } else if (this.#cacheStrategy === 'stable-only') {
      // Only cache stable content (truncated + text-only + first user)
      const stableOnly = [...textOnlyAssistants, ...stableAssistants].sort((a, b) => a - b);
      if (firstUserIdx !== -1 && !breakpoints.includes(firstUserIdx)) {
        breakpoints.push(firstUserIdx);
      }
      const slotsLeft = MAX_CACHE_BREAKPOINTS - breakpoints.length;
      breakpoints.push(...stableOnly.slice(-slotsLeft));
    } else {
      // 'balanced' (default): Use first user as stable anchor, then latest assistants
      this.applyBalancedStrategy(
        breakpoints,
        remainingSlots,
        stableAssistants,
        textOnlyAssistants,
        unstableAssistants,
        allAssistantIndices,
        firstUserIdx,
      );
    }

    return breakpoints;
  }

  /**
   * Balanced cache strategy:
   * - Slot 1: System message (always)
   * - Slot 2: First user message (NEVER truncated - stable anchor)
   * - Slots 3-4: Latest assistants (for incremental caching)
   *
   * The first user message creates a stable cache prefix because:
   * - User messages are NEVER modified by truncation middleware
   * - Usually contains the initial context/question
   * - Provides a long cache prefix (system + user) that survives truncation
   */
  private applyBalancedStrategy(
    breakpoints: number[],
    remainingSlots: number,
    stableAssistants: number[],
    textOnlyAssistants: number[],
    _unstableAssistants: number[],
    allAssistantIndices: number[],
    firstUserIdx: number,
  ): void {
    // First user message is ALWAYS stable (never truncated) - use as anchor
    if (firstUserIdx !== -1 && !breakpoints.includes(firstUserIdx)) {
      breakpoints.push(firstUserIdx);
      this.getLogger().debug(
        `[${this.getName()}] Using first user message at index ${firstUserIdx} as stable anchor`,
      );
    }

    // Calculate remaining slots after user anchor
    const slotsLeft = MAX_CACHE_BREAKPOINTS - breakpoints.length;
    if (slotsLeft <= 0) {
      return;
    }

    // All inherently stable assistant content (text-only + already truncated)
    const allStable = [...textOnlyAssistants, ...stableAssistants].sort((a, b) => a - b);

    // If we have stable assistants, reserve 1 slot for the last one
    if (allStable.length > 0 && slotsLeft >= 2) {
      const lastStable = allStable[allStable.length - 1];
      if (!breakpoints.includes(lastStable)) {
        breakpoints.push(lastStable);
        this.getLogger().debug(
          `[${this.getName()}] Reserved slot for stable assistant at index ${lastStable}`,
        );
      }
    }

    // Fill remaining slots with latest assistants
    const finalSlotsLeft = MAX_CACHE_BREAKPOINTS - breakpoints.length;
    if (finalSlotsLeft > 0) {
      const latestCandidates = allAssistantIndices.filter((idx) => !breakpoints.includes(idx));
      const toAdd = latestCandidates.slice(-finalSlotsLeft);
      breakpoints.push(...toAdd);
      if (toAdd.length > 0) {
        this.getLogger().debug(
          `[${this.getName()}] Added ${toAdd.length} latest assistants: ${toAdd.join(', ')}`,
        );
      }
    }
  }

  /**
   * Check if a value appears to have been truncated by the truncation middleware.
   */
  #looksTruncated(value: unknown): boolean {
    const s = safeJsonStringify(value);
    return (
      TRUNCATION_MARKER_PREFIXES.some((prefix) => s.includes(prefix)) ||
      TRUNCATION_ARRAY_MARKER_REGEX.test(s) ||
      s.includes(`"${TRUNCATION_OBJECT_MARKER_KEY}"`)
    );
  }

  #isToolCallPart(part: unknown): part is LanguageModelV3ToolCallPart {
    return !!part && typeof part === 'object' && (part as { type?: unknown }).type === 'tool-call';
  }

  #isToolResultPart(part: unknown): part is LanguageModelV3ToolResultPart {
    return (
      !!part && typeof part === 'object' && (part as { type?: unknown }).type === 'tool-result'
    );
  }

  #hasToolParts(message: LanguageModelV3Message): boolean {
    const content = message.content;
    if (typeof content === 'string' || !Array.isArray(content)) {
      return false;
    }
    return content.some((part) => this.#isToolCallPart(part) || this.#isToolResultPart(part));
  }

  /**
   * Check if a message has already been truncated (stable for caching).
   */
  private isMessageAlreadyTruncated(message: LanguageModelV3Message): boolean {
    if (message.role !== 'assistant') {
      return false;
    }

    const content = message.content;
    if (typeof content === 'string') {
      return this.#looksTruncated(content);
    }
    if (!Array.isArray(content)) {
      return false;
    }

    for (const part of content) {
      if (this.#isToolCallPart(part) && this.#looksTruncated(part.input)) {
        return true;
      }
      if (this.#isToolResultPart(part) && this.#looksTruncated(part.output)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if message ends with reasoning content (Anthropic requirement).
   */
  private hasEndsWithReasoningContent(message: LanguageModelV3Message): boolean {
    if (message.role !== 'assistant') {
      return false;
    }

    const content = message.content;
    if (!Array.isArray(content) || content.length === 0) {
      return false;
    }

    const lastPart = content[content.length - 1];
    return (
      typeof lastPart === 'object' &&
      lastPart !== null &&
      'type' in lastPart &&
      lastPart.type === 'reasoning'
    );
  }

  protected applyCacheControl(message: LanguageModelV3Message): void {
    (message as { providerOptions?: Record<string, unknown> }).providerOptions = {
      ...(message.providerOptions || {}),
      anthropic: { cacheControl: { type: 'ephemeral', ttl: '5m' } },
    };
  }
}
