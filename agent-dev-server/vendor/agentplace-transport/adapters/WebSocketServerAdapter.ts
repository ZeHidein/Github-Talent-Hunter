import type { ITransport, TransportEvent } from '../Transport';
import type { Packet, TransferableItem } from '../types';

export interface WebSocketServerAdapterOptions {
  /**
   * Enable heartbeat ping/pong to detect dead connections.
   * @default true
   */
  heartbeat?: boolean;

  /**
   * How often to send a ping frame, in milliseconds.
   * @default 25000 (25 seconds)
   */
  pingInterval?: number;

  /**
   * How long to wait for a pong response after sending a ping, in milliseconds.
   * If no pong is received within this window, the connection is terminated.
   * @default 20000 (20 seconds)
   */
  pongTimeout?: number;
}

/**
 * Server-side WebSocket adapter for RpcPeer using Node.js `ws` package.
 *
 * This adapter implements ITransport for server-side WebSocket connections,
 * allowing RpcPeer to work identically on both client and server.
 *
 * @example
 * ```typescript
 * import { WebSocketServer } from 'ws';
 * import { WebSocketServerAdapter, RpcPeer } from 'agentplace-transport';
 *
 * const wss = new WebSocketServer({ port: 8080 });
 *
 * wss.on('connection', (ws) => {
 *   const adapter = new WebSocketServerAdapter(ws);
 *   const rpcPeer = new RpcPeer(adapter);
 *
 *   rpcPeer.onMessage(async (payload) => {
 *     // Handle incoming requests
 *     return { success: true };
 *   });
 *
 *   // Server can also initiate requests to client
 *   const response = await rpcPeer.ask({ type: 'GET_DATA' });
 * });
 * ```
 */
export class WebSocketServerAdapter implements ITransport {
  #ws: WebSocketLike;
  #listeners: Partial<Record<TransportEvent, Function>> = {};
  #pingTimer: ReturnType<typeof setInterval> | null = null;
  #pongTimer: ReturnType<typeof setTimeout> | null = null;
  #options: Required<WebSocketServerAdapterOptions>;
  #onCloseCallbacks: Array<(code: number, reason: string) => void> = [];
  isConnected = false;

  /**
   * Create a new server-side WebSocket adapter.
   * @param ws - A WebSocket instance from the 'ws' package
   * @param options - Optional configuration
   */
  constructor(ws: WebSocketLike, options: WebSocketServerAdapterOptions = {}) {
    this.#ws = ws;
    this.#options = {
      heartbeat: options.heartbeat ?? true,
      pingInterval: options.pingInterval ?? 25000,
      pongTimeout: options.pongTimeout ?? 20000,
    };

    // Check initial connection state
    // ws.readyState: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
    this.isConnected = ws.readyState === 1;

    // Handle incoming messages
    ws.on('message', (data: Buffer | ArrayBuffer | string | Buffer[]) => {
      try {
        const str = this.#dataToString(data);
        const packet = JSON.parse(str) as Packet;
        this.#listeners.message?.(packet);
      } catch (e) {
        console.error('[WebSocketServerAdapter] Failed to parse message:', e);
      }
    });

    // Handle connection close
    ws.on('close', (code?: number, reason?: Buffer | string) => {
      const wasConnected = this.isConnected;
      this.isConnected = false;
      this.#stopHeartbeat();

      const closeCode = code ?? 1006;
      const reasonStr = this.#dataToString(reason);

      if (wasConnected) {
        // Log as warn for abnormal closures to capture in Sentry
        if (code !== 1000 && code !== 1001) {
          console.warn(
            `[WebSocketServerAdapter] Connection closed abnormally: code=${code}, reason=${reasonStr}, wasClean=false`,
          );
        } else {
          console.log(
            `[WebSocketServerAdapter] Connection closed: code=${code}, reason=${reasonStr}`,
          );
        }
        this.#listeners.disconnect?.();
      }

      // Invoke all registered onClose callbacks
      for (const cb of this.#onCloseCallbacks) {
        try {
          cb(closeCode, reasonStr);
        } catch (e) {
          console.error('[WebSocketServerAdapter] onClose callback error:', e);
        }
      }
    });

    // Handle errors
    ws.on('error', (err: Error) => {
      console.error('[WebSocketServerAdapter] WebSocket error:', err.message);
    });

    // Handle open event (only for connections not yet open when adapter is created)
    // Server-side connections from wss.on('connection') are always readyState=1 (OPEN)
    if (ws.readyState !== 1) {
      ws.on('open', () => {
        console.log('[WebSocketServerAdapter] Connection opened');
        this.isConnected = true;
        this.#listeners.connect?.();
        this.#startHeartbeat();
      });
    }

    // Handle pong response — clear the one-shot pong deadline timer
    ws.on('pong', () => {
      if (this.#pongTimer) {
        clearTimeout(this.#pongTimer);
        this.#pongTimer = null;
      }
    });

    // If already connected, emit connect event on next tick and start heartbeat
    if (this.isConnected) {
      setTimeout(() => {
        console.log('[WebSocketServerAdapter] Already connected, emitting connect event');
        this.#listeners.connect?.();
        this.#startHeartbeat();
      }, 0);
    }
  }

  /**
   * Two-timer heartbeat (Socket.IO pattern):
   *   Timer 1 — `pingTimer` (repeating): sends a ping every `pingInterval` ms.
   *   Timer 2 — `pongTimer` (one-shot):  started after each ping, fires after
   *             `pongTimeout` ms. If a pong arrives in time the timer is cleared
   *             (see the `ws.on('pong')` handler). If not, the connection is
   *             terminated.
   */
  #startHeartbeat(): void {
    if (!this.#options.heartbeat) {
      return;
    }

    this.#stopHeartbeat();

    const { pingInterval, pongTimeout } = this.#options;
    console.log(
      `[WebSocketServerAdapter] Starting heartbeat (pingInterval=${pingInterval}ms, pongTimeout=${pongTimeout}ms)`,
    );

    this.#pingTimer = setInterval(() => {
      if (typeof this.#ws.ping !== 'function') {
        console.warn('[WebSocketServerAdapter] ping() method not available on WebSocket');
        return;
      }

      this.#ws.ping();

      // Start a one-shot deadline for THIS ping's pong response.
      // Cleared by the ws.on('pong') handler if pong arrives in time.
      this.#pongTimer = setTimeout(() => {
        console.warn(
          `[WebSocketServerAdapter] Connection dead — no pong received within ${pongTimeout}ms, terminating`,
        );
        this.#ws.terminate?.();
      }, pongTimeout);
    }, pingInterval);
  }

  /**
   * Stop both heartbeat timers.
   */
  #stopHeartbeat(): void {
    if (this.#pingTimer) {
      clearInterval(this.#pingTimer);
      this.#pingTimer = null;
    }
    if (this.#pongTimer) {
      clearTimeout(this.#pongTimer);
      this.#pongTimer = null;
    }
  }

  /**
   * Send a packet to the connected client.
   * @param packet - The packet to send
   * @param _transfer - Ignored (Transferables not supported in Node.js WebSocket)
   */
  send(packet: Packet, _transfer?: TransferableItem[]): void {
    if (!this.isConnected) {
      console.warn('[WebSocketServerAdapter] Cannot send: not connected');
      return;
    }

    try {
      const data = JSON.stringify(packet);
      this.#ws.send(data);
    } catch (e) {
      console.error('[WebSocketServerAdapter] Failed to send packet:', e);
      throw e;
    }
  }

  /**
   * Register an event listener.
   * @param event - The event type ('connect', 'disconnect', or 'message')
   * @param fn - The callback function
   */
  on(event: TransportEvent, fn: Function): void {
    this.#listeners[event] = fn;
  }

  /**
   * Close the WebSocket connection.
   * @param code - Optional close code (default: 1000 = normal closure)
   * @param reason - Optional close reason
   */
  close(code: number = 1000, reason?: string): void {
    console.log('[WebSocketServerAdapter] Closing connection');
    this.#stopHeartbeat();
    try {
      this.#ws.close(code, reason);
    } catch (e) {
      console.error('[WebSocketServerAdapter] Error closing connection:', e);
    }
  }

  /**
   * Register a callback to be invoked when the connection closes.
   * Unlike adding a raw ws.on('close') listener, this does not add
   * additional listeners to the underlying WebSocket — all close
   * handling is funnelled through the adapter's single close listener.
   *
   * @param fn - Callback receiving (code, reason)
   */
  onClose(fn: (code: number, reason: string) => void): void {
    this.#onCloseCallbacks.push(fn);
  }

  /**
   * Remove all listeners from the underlying WebSocket and clean up.
   * Call this when the connection is done to prevent memory leaks.
   */
  dispose(): void {
    this.#stopHeartbeat();
    this.#onCloseCallbacks.length = 0;
    this.#listeners = {};
    if (typeof this.#ws.removeAllListeners === 'function') {
      this.#ws.removeAllListeners();
    }
  }

  /**
   * Convert various data types to string.
   * The ws package can deliver messages as Buffer, ArrayBuffer, string, or Buffer[].
   */
  #dataToString(data: Buffer | ArrayBuffer | string | Buffer[] | undefined): string {
    if (data === undefined) {
      return '';
    }
    if (typeof data === 'string') {
      return data;
    }
    if (Buffer.isBuffer(data)) {
      return data.toString('utf8');
    }
    if (data instanceof ArrayBuffer) {
      return Buffer.from(data).toString('utf8');
    }
    if (Array.isArray(data)) {
      return Buffer.concat(data).toString('utf8');
    }
    return String(data);
  }
}

/**
 * Minimal interface for WebSocket compatibility.
 * This allows the adapter to work with the 'ws' package without importing it directly,
 * avoiding bundling issues when the adapter is used in different contexts.
 */
export interface WebSocketLike {
  readyState: number;
  send(data: string | Buffer | ArrayBuffer | Buffer[]): void;
  close(code?: number, reason?: string): void;
  /** Immediate termination (ws package specific) */
  terminate?(): void;
  /** Send ping frame (ws package specific) */
  ping?(data?: unknown, mask?: boolean, cb?: (err: Error) => void): void;
  /** Remove all listeners (Node.js EventEmitter / ws package) */
  removeAllListeners?(event?: string): void;
  on(event: 'message', listener: (data: Buffer | ArrayBuffer | string | Buffer[]) => void): void;
  on(event: 'close', listener: (code?: number, reason?: Buffer | string) => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
  on(event: 'open', listener: () => void): void;
  on(event: 'pong', listener: () => void): void;
  on(event: string, listener: (...args: any[]) => void): void;
}
