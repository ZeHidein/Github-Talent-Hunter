import type { IStateTransport } from './state-connection.ts';
import type { StateBackend, StateChangeEvent, Unsubscribe } from './types.ts';

/**
 * RpcStateBackend — production backend that talks to Platform Server via RpcPeer.
 *
 * All persistence happens server-side (DynamoDB). This backend is a thin RPC proxy.
 * Remote change notifications arrive via RpcPeer notify() from the server.
 *
 * Phase 2.5: On reconnect, performs a sync to recover missed changes using
 * the server's MemoryDB changelog. Buffers notifications during sync to avoid
 * gaps from the subscribe-before-read pattern.
 */
export class RpcStateBackend implements StateBackend {
  #transport: IStateTransport;
  #listeners = new Set<(event: StateChangeEvent) => void>();
  #cacheResetListeners = new Set<() => void>();
  #connected = false;

  // Phase 2.5: State sync on reconnect
  #lastChangeSeq = 0;
  #hasReceivedConnected = false;
  #syncing = false;
  #syncBuffer: StateChangeEvent[] = [];
  #syncPromise: Promise<void> | null = null;
  #handlerRegistered = false;

  constructor(transport: IStateTransport) {
    this.#transport = transport;
  }

  async get<T>(path: string): Promise<T | null> {
    const result = await this.#transport.ask<{ value: T | null }>({
      type: 'state:get',
      path,
    });
    return result.value ?? null;
  }

  async set<T>(path: string, value: T): Promise<void> {
    await this.#transport.ask({ type: 'state:set', path, value });
  }

  async delete(path: string): Promise<void> {
    await this.#transport.ask({ type: 'state:delete', path });
  }

  async list(prefix: string): Promise<string[]> {
    const result = await this.#transport.ask<{ paths: string[] }>({
      type: 'state:list',
      prefix,
    });
    return result.paths;
  }

  onRemoteChange(handler: (event: StateChangeEvent) => void): Unsubscribe {
    this.#listeners.add(handler);
    return () => this.#listeners.delete(handler);
  }

  onCacheReset(handler: () => void): Unsubscribe {
    this.#cacheResetListeners.add(handler);
    return () => this.#cacheResetListeners.delete(handler);
  }

  async connect(): Promise<void> {
    if (this.#connected) {
      return;
    }
    this.#connected = true;

    if (this.#handlerRegistered) {
      return;
    }
    this.#handlerRegistered = true;

    // Listen for notifications pushed by the server
    this.#transport.onNotify((message: unknown) => {
      const msg = message as Record<string, unknown>;

      // Server sends { type: 'connected' } on each WebSocket connection.
      // On first connect: no sync needed (cache is empty, reads fetch on demand).
      // On reconnect: trigger sync to recover missed changes.
      if (msg.type === 'connected') {
        const isReconnect = this.#hasReceivedConnected;
        console.log('[RpcStateBackend] Received "connected" notification', {
          isReconnect,
          lastChangeSeq: this.#lastChangeSeq,
        });
        if (isReconnect) {
          this.#syncState();
        }
        this.#hasReceivedConnected = true;
        return;
      }

      if (msg.type === 'state:changed') {
        const event: StateChangeEvent = {
          path: msg.path as string,
          change: msg.change as 'set' | 'delete',
          value: msg.value,
          source: 'remote',
          timestamp: (msg.timestamp as string) || new Date().toISOString(),
          changeSeq: msg.changeSeq as number | undefined,
        };

        // During sync, buffer notifications to drain after sync completes.
        // Don't update #lastChangeSeq here — dedup happens in #drainBuffer.
        if (this.#syncing) {
          this.#syncBuffer.push(event);
          return;
        }

        // Track changeSeq for sync (only for delivered events)
        if (event.changeSeq) {
          this.#lastChangeSeq = Math.max(this.#lastChangeSeq, event.changeSeq);
        }

        this.#fireListeners(event);
      }
    });
  }

  disconnect(): void {
    this.#connected = false;
    // WebSocket lifecycle is managed externally by StateConnection
  }

  #fireListeners(event: StateChangeEvent): void {
    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[RpcStateBackend] Listener error:', err);
      }
    }
  }

  /**
   * Sync state after reconnect. Sends the last known changeSeq to the server,
   * which responds with either a diff (individual changes) or a full snapshot.
   */
  async #syncState(): Promise<void> {
    // Guard against concurrent syncs from rapid reconnects
    if (this.#syncPromise) {
      console.log('[RpcStateBackend] Sync already in progress, skipping');
      return;
    }
    this.#syncPromise = this.#doSync();
    try {
      await this.#syncPromise;
    } finally {
      this.#syncPromise = null;
    }
  }

  async #doSync(): Promise<void> {
    console.log('[RpcStateBackend] Starting sync', {
      lastChangeSeq: this.#lastChangeSeq,
    });
    this.#syncing = true;
    this.#syncBuffer = [];

    try {
      const result = await this.#transport.ask<{
        type: 'state:diff' | 'state:snapshot';
        changes?: Array<{
          path: string;
          change: 'set' | 'delete';
          value?: unknown;
          changeSeq: number;
        }>;
        entries?: Record<string, unknown>;
        lastChangeSeq: number;
      }>({
        type: 'state:sync',
        lastChangeSeq: this.#lastChangeSeq,
      });

      if (result.type === 'state:snapshot') {
        const inboxPaths = Object.keys(result.entries ?? {}).filter((p) => p.startsWith('/inbox/'));
        console.log('[RpcStateBackend] Sync received full snapshot', {
          totalEntries: Object.keys(result.entries ?? {}).length,
          inboxEntries: inboxPaths.length,
          inboxPaths,
          lastChangeSeq: result.lastChangeSeq,
        });
        // Full snapshot — notify cache reset, then fire set events for all entries
        for (const handler of this.#cacheResetListeners) {
          try {
            handler();
          } catch (err) {
            console.error('[RpcStateBackend] Cache reset handler error:', err);
          }
        }

        for (const [path, value] of Object.entries(result.entries ?? {})) {
          this.#fireListeners({
            path,
            change: 'set',
            value,
            source: 'remote',
            timestamp: new Date().toISOString(),
            changeSeq: result.lastChangeSeq,
          });
        }
      } else if (result.type === 'state:diff') {
        const inboxChanges = (result.changes ?? []).filter((c) => c.path.startsWith('/inbox/'));
        console.log('[RpcStateBackend] Sync received diff', {
          totalChanges: (result.changes ?? []).length,
          inboxChanges: inboxChanges.length,
          inboxPaths: inboxChanges.map((c) => c.path),
          lastChangeSeq: result.lastChangeSeq,
        });
        // Apply individual changes
        for (const change of result.changes ?? []) {
          this.#fireListeners({
            path: change.path,
            change: change.change,
            value: change.value,
            source: 'remote',
            timestamp: new Date().toISOString(),
            changeSeq: change.changeSeq,
          });
        }
      }

      this.#lastChangeSeq = Math.max(this.#lastChangeSeq, result.lastChangeSeq);
    } catch (err) {
      console.error('[RpcStateBackend] Sync failed:', err);
    } finally {
      this.#syncing = false;
      this.#drainBuffer();
    }
  }

  /**
   * Drain buffered notifications received during sync.
   * Skips events already covered by the sync result (dedup by changeSeq).
   */
  #drainBuffer(): void {
    if (this.#syncBuffer.length > 0) {
      const inboxEvents = this.#syncBuffer.filter((e) => e.path.startsWith('/inbox/'));
      console.log('[RpcStateBackend] Draining sync buffer', {
        totalBuffered: this.#syncBuffer.length,
        inboxBuffered: inboxEvents.length,
        lastChangeSeq: this.#lastChangeSeq,
      });
    }
    for (const event of this.#syncBuffer) {
      if (event.changeSeq && event.changeSeq <= this.#lastChangeSeq) {
        continue;
      }
      if (event.changeSeq) {
        this.#lastChangeSeq = Math.max(this.#lastChangeSeq, event.changeSeq);
      }
      this.#fireListeners(event);
    }
    this.#syncBuffer = [];
  }
}
