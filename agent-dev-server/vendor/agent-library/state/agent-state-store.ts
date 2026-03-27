import { globMatch } from './glob-match.ts';
import type { StateBackend, StateChangeEvent, Unsubscribe } from './types.ts';

interface Subscription {
  pattern: string;
  handler: (event: StateChangeEvent) => void;
}

/**
 * AgentStateStore — reactive key-value store with path subscriptions.
 *
 * - Local in-memory cache for fast reads
 * - Delegates persistence to a pluggable StateBackend
 * - Fires local subscribers on both local writes and remote notifications
 * - Glob-pattern subscriptions (*, **)
 */
export class AgentStateStore {
  #backend: StateBackend;
  #cache = new Map<string, unknown>();
  #subscriptions: Subscription[] = [];
  #remoteUnsubscribe: Unsubscribe | null = null;
  #cacheResetUnsubscribe: Unsubscribe | null = null;

  constructor(backend: StateBackend) {
    this.#backend = backend;
  }

  /**
   * Get a value by path. Reads from local cache first, falls back to backend.
   */
  async get<T>(path: string): Promise<T | null> {
    if (this.#cache.has(path)) {
      return this.#cache.get(path) as T;
    }
    const value = await this.#backend.get<T>(path);
    if (value !== null) {
      this.#cache.set(path, value);
    }
    return value;
  }

  /**
   * Set a value at path. Persists to backend and updates local cache.
   * Fires subscribers with source='local'.
   */
  async set<T>(path: string, value: T): Promise<void> {
    await this.#backend.set(path, value);
    this.#cache.set(path, value);
    this.#fireSubscribers({
      path,
      change: 'set',
      value,
      source: 'local',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Delete a value at path. Removes from backend and local cache.
   * Fires subscribers with change='delete'.
   */
  async delete(path: string): Promise<void> {
    await this.#backend.delete(path);
    this.#cache.delete(path);
    this.#fireSubscribers({
      path,
      change: 'delete',
      source: 'local',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * List all child paths under a prefix.
   */
  async list(prefix: string): Promise<string[]> {
    return this.#backend.list(prefix);
  }

  /**
   * Subscribe to changes matching a glob pattern.
   * Fires on both local writes and remote notifications.
   *
   * @example
   * store.subscribe('/inbox/triggers/**', (event) => { ... })
   * store.subscribe('/sessions/* /state', (event) => { ... })
   */
  subscribe(pattern: string, handler: (event: StateChangeEvent) => void): Unsubscribe {
    const sub: Subscription = { pattern, handler };
    this.#subscriptions.push(sub);
    return () => {
      const idx = this.#subscriptions.indexOf(sub);
      if (idx >= 0) {
        this.#subscriptions.splice(idx, 1);
      }
    };
  }

  /**
   * Dispatch a synthetic event to local subscribers.
   * Used by InboxReconciler to re-process missed events on startup.
   */
  dispatchLocal(event: StateChangeEvent): void {
    if (event.change === 'set' && event.value !== undefined) {
      this.#cache.set(event.path, event.value);
    } else if (event.change === 'delete') {
      this.#cache.delete(event.path);
    }
    this.#fireSubscribers(event);
  }

  /**
   * Connect to the backend and start receiving remote notifications.
   */
  async connect(): Promise<void> {
    // Register cache reset handler (Phase 2.5: full snapshot sync clears cache)
    if (this.#backend.onCacheReset) {
      this.#cacheResetUnsubscribe = this.#backend.onCacheReset(() => {
        this.#cache.clear();
      });
    }

    // Listen for remote changes from the backend (server pushes)
    this.#remoteUnsubscribe = this.#backend.onRemoteChange((event) => {
      // Update local cache
      if (event.change === 'set' && event.value !== undefined) {
        this.#cache.set(event.path, event.value);
      } else if (event.change === 'delete') {
        this.#cache.delete(event.path);
      }
      // Fire local subscribers
      this.#fireSubscribers(event);
    });

    await this.#backend.connect();
  }

  /**
   * Disconnect from server. Local cache remains intact.
   */
  disconnect(): void {
    this.#cacheResetUnsubscribe?.();
    this.#cacheResetUnsubscribe = null;
    this.#remoteUnsubscribe?.();
    this.#remoteUnsubscribe = null;
    this.#backend.disconnect();
  }

  #fireSubscribers(event: StateChangeEvent): void {
    for (const sub of [...this.#subscriptions]) {
      if (globMatch(event.path, sub.pattern)) {
        try {
          sub.handler(event);
        } catch (err) {
          console.error(`[AgentStateStore] Subscriber error for pattern '${sub.pattern}':`, err);
        }
      }
    }
  }
}
