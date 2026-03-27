import type { PlainObject } from '../types';

export function omit(obj: PlainObject, ...keys: string[]) {
  const keysToRemove = new Set(keys.flat());

  return Object.fromEntries(Object.entries(obj).filter(([k]) => !keysToRemove.has(k)));
}
