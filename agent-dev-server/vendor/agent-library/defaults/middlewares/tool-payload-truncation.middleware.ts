import type {
  LanguageModelV3CallOptions,
  LanguageModelV3Prompt,
  LanguageModelV3ToolCallPart,
} from '@ai-sdk/provider';
import type { LanguageModelMiddleware } from 'ai';
import type {
  KernelModelMiddleware,
  KernelModelMiddlewareContext,
} from '../../kernel/middlewares/types.ts';
import { getPromptPressureTokens } from '../../util/token-usage.ts';
import { getAgentLogger } from '../../types/logger.ts';
import {
  DEFAULT_TOOL_PAYLOAD_TRUNCATION_CONFIG,
  type ToolPayloadTruncationConfig,
} from './tool-payload-truncation.config.ts';
import {
  truncateToolPayloadsInPrompt,
  truncateToolPayloadsInModelMessages,
  looksTruncated,
  isToolCallPartLike,
  isToolResultPartLike,
} from './tool-payload-truncation.ts';
import { dropMiddleTurns, dropMiddleTurnsModelMessages } from './prompt-utils.ts';
import { setCacheHint } from '../../cache/metadata/cache-hints.ts';

const logger = getAgentLogger();

export type ToolPayloadTruncationMiddlewareOptions = Partial<ToolPayloadTruncationConfig> & {
  /**
   * Activate when the previous call's effective prompt tokens >= this value.
   * Falls back to `usage.totalTokens` if input token usage is missing.
   * If not set, the middleware is a no-op (unless escalation is active).
   */
  triggerTokens?: number;

  /**
   * Preserve last N turns when dropping middle turns (Stage-2).
   * @default 2
   */
  preserveLastNTurnsForDrop?: number;
};

/** @deprecated Renamed to `ToolPayloadTruncationMiddlewareOptions`. */
export type ToolPayloadTruncationMiddlewareConfig = ToolPayloadTruncationMiddlewareOptions;

const DEFAULT_MIDDLEWARE_OPTIONS = {
  preserveLastNTurnsForDrop: 2,
} as const;

function normalizePositiveInt(n: unknown, fallback: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    return fallback;
  }
  const v = Math.floor(n);
  return v > 0 ? v : fallback;
}

type NormalizedOptions = {
  triggerTokens?: number;
  toolCfg: Partial<ToolPayloadTruncationConfig>;
  preserveLastNTurnsForDrop: number;
};

function normalizeOptions(opts: ToolPayloadTruncationMiddlewareOptions): NormalizedOptions {
  const { triggerTokens, preserveLastNTurnsForDrop, ...toolCfg } = opts;
  return {
    triggerTokens,
    toolCfg: toolCfg as Partial<ToolPayloadTruncationConfig>,
    preserveLastNTurnsForDrop: normalizePositiveInt(
      preserveLastNTurnsForDrop,
      DEFAULT_MIDDLEWARE_OPTIONS.preserveLastNTurnsForDrop,
    ),
  };
}

/**
 * Level 0: configured maxPreservedToolIterations (e.g. 20) fully preserved, no soft cap. Stage-1 only.
 * Level 1: 10 fully preserved, next 10 soft-capped at 5k. Stage-1 + Stage-2.
 * Level 2+: 0 fully preserved, 20 soft-capped at 5k. Stage-1 + Stage-2, preserveLastN=1.
 */
function computeEffectiveConfig(
  baseCfg: ToolPayloadTruncationConfig,
  basePreserveLastN: number,
  escalation: number,
): { cfg: ToolPayloadTruncationConfig; preserveLastN: number; shouldDropTurns: boolean } {
  const configuredMax = baseCfg.maxPreservedToolIterations ?? 20;
  const softCapChars = baseCfg.maxSoftCapStringChars ?? 5000;

  if (escalation >= 2) {
    return {
      cfg: {
        ...baseCfg,
        maxPreservedToolIterations: 0,
        softCappedToolIterations: configuredMax,
        maxSoftCapStringChars: softCapChars,
      },
      preserveLastN: 1,
      shouldDropTurns: true,
    };
  }
  if (escalation >= 1) {
    const half = Math.floor(configuredMax / 2);
    return {
      cfg: {
        ...baseCfg,
        maxPreservedToolIterations: half,
        softCappedToolIterations: configuredMax - half,
        maxSoftCapStringChars: softCapChars,
      },
      preserveLastN: basePreserveLastN,
      shouldDropTurns: true,
    };
  }
  return { cfg: baseCfg, preserveLastN: basePreserveLastN, shouldDropTurns: false };
}

function annotateCacheHints(
  prompt: LanguageModelV3Prompt,
  config: ToolPayloadTruncationConfig,
): void {
  const neverTruncateSet = new Set(config.neverTruncateToolNames ?? []);

  for (const msg of prompt) {
    if (msg.role === 'system') {
      setCacheHint(msg, { stable: true, reason: 'system' });
      continue;
    }
    if (msg.role === 'user') {
      setCacheHint(msg, { stable: true, reason: 'user' });
      continue;
    }

    if (msg.role === 'assistant') {
      if (typeof msg.content === 'string' || !Array.isArray(msg.content)) {
        setCacheHint(msg, { stable: true, reason: 'text-only' });
        continue;
      }

      const toolParts = msg.content.filter((p) => isToolCallPartLike(p) || isToolResultPartLike(p));

      if (toolParts.length === 0) {
        setCacheHint(msg, { stable: true, reason: 'text-only' });
        continue;
      }

      const toolCallPart = toolParts.find((p) => isToolCallPartLike(p)) as
        | LanguageModelV3ToolCallPart
        | undefined;
      if (toolCallPart && neverTruncateSet.has(toolCallPart.toolName)) {
        setCacheHint(msg, { stable: true, reason: 'preserved-tool' });
        continue;
      }

      const resultParts = toolParts.filter((p) => isToolResultPartLike(p));
      if (resultParts.length === 0) {
        setCacheHint(msg, { stable: true, reason: 'tool-call-only' });
        continue;
      }

      // Already-truncated content won't change again -- safe to cache.
      const isTruncated = resultParts.some(
        (part) => isToolResultPartLike(part) && looksTruncated(part.output),
      );

      setCacheHint(
        msg,
        isTruncated ? { stable: true, reason: 'already-truncated' } : { stable: false },
      );
    }
  }
}

/**
 * Two-stage context compression:
 *
 * - Stage 1: truncate tool payloads for older iterations.
 * - Stage 2: drop middle turns (gated by escalation level >= 1).
 *
 * Persists truncation to state via `replaceKernelHistory()` so changes
 * survive across request boundaries.
 */
export class ToolPayloadTruncationMiddleware implements KernelModelMiddleware {
  private readonly normalized: NormalizedOptions;

  constructor(options: ToolPayloadTruncationMiddlewareOptions = {}) {
    this.normalized = normalizeOptions(options);
  }

  create(ctx: KernelModelMiddlewareContext): LanguageModelMiddleware {
    const { triggerTokens, toolCfg, preserveLastNTurnsForDrop } = this.normalized;

    const merged: ToolPayloadTruncationConfig = {
      ...DEFAULT_TOOL_PAYLOAD_TRUNCATION_CONFIG,
      ...toolCfg,
    };

    return {
      specificationVersion: 'v3',
      transformParams: async ({ params }) => {
        const opts = params as LanguageModelV3CallOptions;
        const responseId = ctx.state.getResponseId?.();
        const escalation = ctx.state.getTruncationEscalationLevel?.() ?? 0;

        annotateCacheHints(opts.prompt, merged);

        if (triggerTokens == null && escalation === 0) {
          return opts;
        }

        const usage = ctx.state.getLastUsage?.();
        const pressure = getPromptPressureTokens(usage);

        if (escalation === 0 && (pressure == null || pressure < triggerTokens!)) {
          return opts;
        }

        const {
          cfg: effectiveCfg,
          preserveLastN,
          shouldDropTurns,
        } = computeEffectiveConfig(merged, preserveLastNTurnsForDrop, escalation);

        logger.info('[ToolPayloadTruncation] Activated', {
          responseId,
          escalation,
          triggerTokens: triggerTokens ?? null,
          pressure: pressure ?? null,
          effectiveMaxPreserved: effectiveCfg.maxPreservedToolIterations,
          shouldDropTurns,
          lastUsage: usage
            ? {
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                totalTokens: usage.totalTokens,
                inputTokenDetails: usage.inputTokenDetails,
              }
            : null,
        });

        // Stage 1: truncate tool payloads
        const truncated = truncateToolPayloadsInPrompt(opts.prompt, effectiveCfg);
        annotateCacheHints(truncated, effectiveCfg);

        // Stage 2: drop middle turns (escalation >= 1 only)
        const finalPrompt = shouldDropTurns ? dropMiddleTurns(truncated, preserveLastN) : truncated;

        logger.info('[ToolPayloadTruncation] Applied', {
          responseId,
          escalation,
          stage2: shouldDropTurns,
        });

        // Persist to state so changes survive across request boundaries
        const kernelHistory = ctx.state.getKernelConversationHistory?.();
        if (kernelHistory && kernelHistory.length > 0) {
          const compactedHistory = truncateToolPayloadsInModelMessages(kernelHistory, effectiveCfg);
          const finalHistory = shouldDropTurns
            ? dropMiddleTurnsModelMessages(compactedHistory, preserveLastN)
            : compactedHistory;
          ctx.state.replaceKernelHistory?.(finalHistory);
        }

        return { ...opts, prompt: finalPrompt };
      },
    };
  }
}
