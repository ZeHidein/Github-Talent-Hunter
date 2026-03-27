import { randomUUID } from 'node:crypto';

export function generateId(): string {
  return randomUUID();
}

export function generateShortId(length = 8): string {
  return randomUUID().replace(/-/g, '').slice(0, length);
}
