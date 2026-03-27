import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import type { ModelMessage } from '@ai-sdk/provider-utils';
import { isPlainObject } from '../../kernel/utils/type-guards.ts';
import { safeJsonStringify } from '../../kernel/utils/json.ts';

import {
  type ToolPayloadTruncationConfig,
  type ToolPayloadTruncationPlaceholderMeta,
  type ToolPayloadTruncationReason,
  DEFAULT_TOOL_PAYLOAD_TRUNCATION_CONFIG,
  TRUNCATION_MARKER_PREFIXES,
  TRUNCATION_ARRAY_MARKER_REGEX,
  TRUNCATION_OBJECT_MARKER_KEY,
} from './tool-payload-truncation.config.ts';

interface ToolCallPartLike {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  input: unknown;
}

interface ToolResultOutputLike {
  type: string;
  value?: unknown;
}

interface ToolResultPartLike {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  output: ToolResultOutputLike;
}

interface MessageLike {
  role: string;
  content: string | unknown[];
}

export function isToolCallPartLike(part: unknown): part is ToolCallPartLike {
  return !!part && typeof part === 'object' && (part as { type?: unknown }).type === 'tool-call';
}

export function isToolResultPartLike(part: unknown): part is ToolResultPartLike {
  return !!part && typeof part === 'object' && (part as { type?: unknown }).type === 'tool-result';
}

function getPlaceholder(
  cfg: ToolPayloadTruncationConfig,
  meta: ToolPayloadTruncationPlaceholderMeta,
): string {
  const fn =
    cfg.formatTruncationPlaceholder ??
    DEFAULT_TOOL_PAYLOAD_TRUNCATION_CONFIG.formatTruncationPlaceholder!;
  return fn(meta);
}

function isTruncationPlaceholderString(value: string): boolean {
  return TRUNCATION_MARKER_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function truncateStringIfNeeded(
  value: string,
  cfg: ToolPayloadTruncationConfig,
  meta: Omit<ToolPayloadTruncationPlaceholderMeta, 'originalCharCount' | 'reason'> & {
    reason: ToolPayloadTruncationReason;
  },
): string {
  if (isTruncationPlaceholderString(value)) {
    return value;
  }
  if (value.length <= cfg.maxStringChars) {
    return value;
  }
  return getPlaceholder(cfg, {
    ...meta,
    originalCharCount: value.length,
    reason: meta.reason,
  });
}

function truncateValue(
  value: unknown,
  cfg: ToolPayloadTruncationConfig,
  meta: Omit<ToolPayloadTruncationPlaceholderMeta, 'originalCharCount' | 'reason'>,
  depth: number,
  visited: WeakSet<object>,
): unknown {
  if (value == null) {
    return value;
  }
  if (typeof value === 'string') {
    return truncateStringIfNeeded(value, cfg, { ...meta, reason: 'maxStringChars' });
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer?.(value)) {
    return getPlaceholder(cfg, { ...meta, reason: 'binary', originalCharCount: undefined });
  }
  if (value instanceof Uint8Array) {
    return getPlaceholder(cfg, { ...meta, reason: 'binary', originalCharCount: undefined });
  }

  if (typeof value === 'object') {
    const obj = value as object;
    if (visited.has(obj)) {
      return '[CIRCULAR]';
    }
    visited.add(obj);
  }

  if (depth > cfg.maxValueDepth && (Array.isArray(value) || isPlainObject(value))) {
    const json = JSON.stringify(value);
    return truncateStringIfNeeded(json, cfg, { ...meta, reason: 'maxValueDepth' });
  }

  if (Array.isArray(value)) {
    const originalLen = value.length;
    const kept = value.slice(0, cfg.maxItemsPerCollection);
    const cleaned = kept.map((v) => truncateValue(v, cfg, meta, depth + 1, visited));
    const removed = originalLen - kept.length;
    if (removed > 0) {
      cleaned.push(`[... ${removed} more items removed]`);
    }
    return cleaned;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    const keptKeys = keys.slice(0, cfg.maxItemsPerCollection);
    const removed = keys.length - keptKeys.length;
    const out: Record<string, unknown> = {};
    for (const k of keptKeys) {
      out[k] = truncateValue(value[k], cfg, meta, depth + 1, visited);
    }
    if (removed > 0) {
      out._truncated = `${removed} more keys removed`;
    }
    return out;
  }

  try {
    return truncateStringIfNeeded(String(value), cfg, { ...meta, reason: 'maxStringChars' });
  } catch {
    return getPlaceholder(cfg, { ...meta, reason: 'maxStringChars', originalCharCount: undefined });
  }
}

type ToolCallClassification = {
  fullyPreserved: Set<string>;
  softCapped: Set<string>;
};

/**
 * Classifies tool call IDs into three tiers by scanning from the end:
 * - Tier 1 (fullyPreserved): most recent `fullyPreservedCount` unique IDs — no truncation
 * - Tier 2 (softCapped): next `softCappedCount` unique IDs — truncated with soft cap
 * - Tier 3 (everything else): hard-truncated with maxStringChars
 */
function classifyToolCallIds(
  messages: readonly MessageLike[],
  fullyPreservedCount: number,
  softCappedCount: number,
): ToolCallClassification {
  const totalToScan = fullyPreservedCount + softCappedCount;

  if (totalToScan <= 0) {
    return { fullyPreserved: new Set(), softCapped: new Set() };
  }

  if (!Number.isFinite(fullyPreservedCount) && softCappedCount <= 0) {
    const allIds = new Set<string>();
    for (const msg of messages) {
      if (typeof msg.content === 'string' || !Array.isArray(msg.content)) {
        continue;
      }
      for (const part of msg.content) {
        if (isToolCallPartLike(part) || isToolResultPartLike(part)) {
          allIds.add(part.toolCallId);
        }
      }
    }
    return { fullyPreserved: allIds, softCapped: new Set() };
  }

  const orderedIds: string[] = [];
  const seen = new Set<string>();
  const limit = Number.isFinite(totalToScan) ? totalToScan : Infinity;

  for (let i = messages.length - 1; i >= 0 && orderedIds.length < limit; i--) {
    const msg = messages[i];
    if (typeof msg.content === 'string' || !Array.isArray(msg.content)) {
      continue;
    }
    for (let j = msg.content.length - 1; j >= 0 && orderedIds.length < limit; j--) {
      const part = msg.content[j];
      if ((isToolCallPartLike(part) || isToolResultPartLike(part)) && !seen.has(part.toolCallId)) {
        seen.add(part.toolCallId);
        orderedIds.push(part.toolCallId);
      }
    }
  }

  const fullyPreserved = new Set(orderedIds.slice(0, fullyPreservedCount));
  const softCapped = new Set(
    orderedIds.slice(fullyPreservedCount, fullyPreservedCount + softCappedCount),
  );

  return { fullyPreserved, softCapped };
}

function truncateToolResultOutput<T extends ToolResultOutputLike>(
  output: T,
  cfg: ToolPayloadTruncationConfig,
  meta: Omit<ToolPayloadTruncationPlaceholderMeta, 'originalCharCount' | 'reason'>,
  visited: WeakSet<object>,
): T {
  const ensureTextString = (value: unknown): string => {
    if (typeof value === 'string') {
      return value;
    }
    try {
      const s = safeJsonStringify(value);
      return (s as unknown as string) ?? String(value);
    } catch {
      try {
        return String(value);
      } catch {
        return '[UNSERIALIZABLE]';
      }
    }
  };

  if (output.type === 'text' || output.type === 'error-text') {
    const asString = ensureTextString(output.value);
    return { ...output, value: truncateValue(asString, cfg, meta, 0, visited) as string };
  }
  if (output.type === 'json' || output.type === 'error-json') {
    return {
      ...output,
      value: truncateValue(output.value, cfg, meta, 0, visited) as typeof output.value,
    };
  }
  if (output.type === 'content') {
    return {
      type: 'text',
      value: getPlaceholder(cfg, { ...meta, reason: 'maxStringChars' }),
    } as unknown as T;
  }
  return output;
}

function truncateToolResultPart<T extends ToolResultPartLike>(
  part: T,
  cfg: ToolPayloadTruncationConfig,
  neverSet: Set<string>,
): T {
  if (neverSet.has(part.toolName)) {
    return part;
  }
  const visited = new WeakSet<object>();
  const meta = { toolName: part.toolName, toolCallId: part.toolCallId };
  return { ...part, output: truncateToolResultOutput(part.output, cfg, meta, visited) };
}

function truncateToolPayloads<TMsg extends MessageLike>(
  messages: readonly TMsg[],
  config: ToolPayloadTruncationConfig,
): TMsg[] {
  const cfg = { ...DEFAULT_TOOL_PAYLOAD_TRUNCATION_CONFIG, ...(config ?? {}) };
  const neverSet = new Set(cfg.neverTruncateToolNames ?? []);

  const { fullyPreserved, softCapped } = classifyToolCallIds(
    messages,
    cfg.maxPreservedToolIterations ?? Infinity,
    cfg.softCappedToolIterations ?? 0,
  );

  const softCapCfg =
    cfg.maxSoftCapStringChars && cfg.maxSoftCapStringChars !== cfg.maxStringChars
      ? { ...cfg, maxStringChars: cfg.maxSoftCapStringChars }
      : cfg;

  const getCfgForPart = (
    part: ToolCallPartLike | ToolResultPartLike,
  ): ToolPayloadTruncationConfig | null => {
    if (neverSet.has(part.toolName)) {
      return null;
    }
    if (fullyPreserved.has(part.toolCallId)) {
      return null;
    }
    if (softCapped.has(part.toolCallId)) {
      return softCapCfg;
    }
    return cfg;
  };

  return messages.map((msg) => {
    if (typeof msg.content === 'string' || !Array.isArray(msg.content)) {
      return msg;
    }

    if (msg.role === 'assistant') {
      const content = msg.content.map((part) => {
        if (isToolResultPartLike(part)) {
          const partCfg = getCfgForPart(part);
          return partCfg ? truncateToolResultPart(part, partCfg, neverSet) : part;
        }
        return part;
      });
      return { ...msg, content } as TMsg;
    }

    if (msg.role === 'tool') {
      const content = msg.content.map((part) => {
        if (!isToolResultPartLike(part)) {
          return part;
        }
        const partCfg = getCfgForPart(part);
        return partCfg ? truncateToolResultPart(part, partCfg, neverSet) : part;
      });
      return { ...msg, content } as TMsg;
    }

    return msg;
  });
}

/** Checks if a value appears to have been truncated by this module. */
export function looksTruncated(value: unknown): boolean {
  const s = safeJsonStringify(value);
  return (
    TRUNCATION_MARKER_PREFIXES.some((prefix) => s.includes(prefix)) ||
    TRUNCATION_ARRAY_MARKER_REGEX.test(s) ||
    s.includes(`"${TRUNCATION_OBJECT_MARKER_KEY}"`)
  );
}

/** Truncate tool payloads in a LanguageModelV3Prompt (provider-level format). */
export function truncateToolPayloadsInPrompt(
  prompt: LanguageModelV3Prompt,
  config: ToolPayloadTruncationConfig,
): LanguageModelV3Prompt {
  return truncateToolPayloads(prompt, config);
}

/** Truncate tool payloads in a ModelMessage[] (AI SDK user-level format). */
export function truncateToolPayloadsInModelMessages(
  messages: ModelMessage[],
  config: ToolPayloadTruncationConfig,
): ModelMessage[] {
  return truncateToolPayloads(messages, config);
}
