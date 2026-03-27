import type { StateBackend, StateChangeEvent, Unsubscribe } from './types.ts';

/**
 * In-memory StateBackend for unit tests and local dev without a server.
 * No persistence, no network. All data lives in a Map.
 */
export class InMemoryStateBackend implements StateBackend {
  #data = new Map<string, unknown>();
  #listeners = new Set<(event: StateChangeEvent) => void>();
  #cacheResetListeners = new Set<() => void>();

  async get<T>(path: string): Promise<T | null> {
    return (this.#data.get(path) as T) ?? null;
  }

  async set<T>(path: string, value: T): Promise<void> {
    this.#data.set(path, value);
  }

  async delete(path: string): Promise<void> {
    this.#data.delete(path);
  }

  async list(prefix: string): Promise<string[]> {
    return [...this.#data.keys()].filter((k) => k.startsWith(prefix));
  }

  onRemoteChange(handler: (event: StateChangeEvent) => void): Unsubscribe {
    this.#listeners.add(handler);
    return () => this.#listeners.delete(handler);
  }

  onCacheReset(handler: () => void): Unsubscribe {
    this.#cacheResetListeners.add(handler);
    return () => this.#cacheResetListeners.delete(handler);
  }

  /** Simulate a remote write (for testing). */
  simulateRemoteChange(event: StateChangeEvent): void {
    if (event.change === 'set') {
      this.#data.set(event.path, event.value);
    }
    if (event.change === 'delete') {
      this.#data.delete(event.path);
    }
    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[InMemoryStateBackend] Listener error:', err);
      }
    }
  }

  /** Simulate a full cache reset (for testing). */
  simulateCacheReset(): void {
    this.#data.clear();
    for (const handler of this.#cacheResetListeners) {
      handler();
    }
  }

  async connect(): Promise<void> {
    /* no-op */
  }

  disconnect(): void {
    /* no-op */
  }
}
