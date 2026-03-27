export type ToolPayloadTruncationReason =
  | 'maxStringChars'
  | 'maxValueDepth'
  | 'maxItemsPerCollection'
  | 'binary'
  | 'circular';

export type ToolPayloadTruncationPlaceholderMeta = {
  toolName?: string;
  toolCallId?: string;
  originalCharCount?: number;
  reason: ToolPayloadTruncationReason;
};

export interface ToolPayloadTruncationConfig {
  /**
   * Safety cap: maximum number of tool iterations to preserve intact within the
   * prompt. Older iterations (beyond this limit) will have their payloads truncated.
   *
   * This prevents recent tool calls/results from consuming the entire context window
   * while still keeping the most recent tool state intact.
   *
   * Set to 0 to preserve none (truncate everything eligible).
   * Set to Infinity to preserve all (disable truncation based on iteration recency).
   * @default 10
   */
  maxPreservedToolIterations?: number;

  /**
   * Number of recent tool iterations to apply soft-cap truncation
   * (counted after the fully preserved ones).
   * These get `maxSoftCapStringChars` instead of `maxStringChars`.
   * @default 0
   */
  softCappedToolIterations?: number;

  /**
   * String char limit for soft-capped iterations.
   * @default 5000
   */
  maxSoftCapStringChars?: number;

  /**
   * Strings longer than this are replaced with a placeholder.
   */
  maxStringChars: number;

  /**
   * Max depth of structured values. Deeper objects/arrays are serialized to JSON strings.
   * Depth is counted starting from the tool payload root (input/result) as depth 0.
   */
  maxValueDepth: number;

  /**
   * Max number of items per array or object per level.
   */
  maxItemsPerCollection: number;

  /**
   * Tool names that must never be truncated (tool-call input and tool-result output).
   */
  neverTruncateToolNames: string[];

  /**
   * Optional formatting hook for truncated values.
   * Must be deterministic (no timestamps or randomness) to preserve cache stability.
   */
  formatTruncationPlaceholder?: (meta: ToolPayloadTruncationPlaceholderMeta) => string;
}

export const DEFAULT_TOOL_PAYLOAD_TRUNCATION_CONFIG: ToolPayloadTruncationConfig = {
  maxPreservedToolIterations: 10,
  softCappedToolIterations: 0,
  maxSoftCapStringChars: 5000,
  maxStringChars: 500,
  maxValueDepth: 3,
  maxItemsPerCollection: 10,
  neverTruncateToolNames: [],
  formatTruncationPlaceholder: ({ originalCharCount }) =>
    `Content was removed to save context space (TRUNCATED: ~${originalCharCount ?? 'unknown'} chars). Use the corresponding tool to retrieve if needed.`,
};

/**
 * Marker prefixes used by the truncator. Detection logic should check for these.
 */
export const TRUNCATION_MARKER_PREFIXES = [
  '[TRUNCATED',
  'Content was removed to save context space (TRUNCATED:',
] as const;

/**
 * Regex to detect array truncation markers like "[... 5 more items removed]".
 */
export const TRUNCATION_ARRAY_MARKER_REGEX = /\[\.\.\.\s+\d+\s+more items removed\]/;

/**
 * Key used in objects to indicate truncation, e.g. { _truncated: "3 more keys removed" }.
 */
export const TRUNCATION_OBJECT_MARKER_KEY = '_truncated';
