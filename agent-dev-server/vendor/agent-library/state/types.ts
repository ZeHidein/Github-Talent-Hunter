/**
 * State store types — shared between AgentStateStore, backends, and scoped views.
 */

/** A change event emitted by the store when a path is set or deleted. */
export interface StateChangeEvent {
  /** Full path of the changed key */
  path: string;
  /** Type of change */
  change: 'set' | 'delete';
  /** The new value (present for 'set', absent for 'delete') */
  value?: unknown;
  /** Who made the change */
  source: 'local' | 'remote';
  /** When the change occurred (ISO 8601) */
  timestamp: string;
  /** Monotonic sequence number for ordering (set by server when changelog is available) */
  changeSeq?: number;
}

/** Unsubscribe function returned by subscribe(). */
export type Unsubscribe = () => void;

/** Path access rule for scoped views. */
export interface PathRule {
  /** Glob pattern for the path scope */
  path: string;
  /** Access mode */
  mode: 'rw' | 'ro';
}

/**
 * StateBackend — pluggable persistence layer for AgentStateStore.
 *
 * Implementations:
 * - InMemoryStateBackend: unit tests, local dev without server
 * - RpcStateBackend: production — talks to Platform Server via RpcPeer WebSocket
 */
export interface StateBackend {
  /** Read a value from the persistent store */
  get<T>(path: string): Promise<T | null>;
  /** Write a value to the persistent store */
  set<T>(path: string, value: T): Promise<void>;
  /** Delete a value from the persistent store */
  delete(path: string): Promise<void>;
  /** List child paths under a prefix */
  list(prefix: string): Promise<string[]>;
  /**
   * Listen for remote changes (changes made by others, not by this client).
   * The backend pushes events when the server notifies of external writes.
   */
  onRemoteChange(handler: (event: StateChangeEvent) => void): Unsubscribe;
  /** Connect to the remote store */
  connect(): Promise<void>;
  /** Disconnect from the remote store */
  disconnect(): void;
  /**
   * Register a handler called when the backend performs a full cache reset
   * (e.g., on reconnect with a full snapshot sync). The handler should clear
   * any local caches that depend on backend state.
   */
  onCacheReset?(handler: () => void): Unsubscribe;
}
