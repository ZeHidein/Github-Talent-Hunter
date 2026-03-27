/**
 * A narrow "plain object" check intended for JSON-like data structures.
 * (Excludes arrays; treats class instances as non-plain unless they inherit directly from Object.)
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
