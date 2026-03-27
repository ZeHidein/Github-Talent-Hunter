/**
 * Safe JSON stringify for debug/diff usage.
 *
 * - Handles circular structures (replaces with "[CIRCULAR]").
 * - Handles BigInt (stringifies as "[BIGINT <value>]").
 * - Avoids throwing on functions/symbols (stringifies as "[FUNCTION]" / "[SYMBOL]").
 *
 * This is intentionally NOT a general-purpose stable serializer; it is used to safely
 * compare complex values in deterministic middleware flows.
 */
export function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, v) => {
    if (typeof v === 'bigint') {
      return `[BIGINT ${String(v)}]`;
    }
    if (typeof v === 'function') {
      return '[FUNCTION]';
    }
    if (typeof v === 'symbol') {
      return '[SYMBOL]';
    }

    if (typeof v === 'object' && v !== null) {
      if (seen.has(v as object)) {
        return '[CIRCULAR]';
      }
      seen.add(v as object);
    }

    return v;
  });
}
