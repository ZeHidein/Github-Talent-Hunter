import type { ITransport, TransportEvent } from '../Transport';
import type { Packet, TransferableItem } from '../types';

export interface WebSocketAdapterOptions {
  /** WebSocket URL to connect to */
  url: string;
  /** Reconnection delay in ms (default: 1000) */
  reconnectDelay?: number;
  /** Maximum reconnection attempts (default: Infinity) */
  maxReconnectAttempts?: number;
  /** WebSocket protocols (optional) */
  protocols?: string | string[];
}

/**
 * WebSocket adapter for RpcPeer
 * Provides automatic reconnection and lifecycle management
 */
export class WebSocketAdapter implements ITransport {
  #ws: WebSocket | null = null;
  #listeners: Record<string, Function> = {};
  #reconnectAttempts = 0;
  #reconnectTimer?: ReturnType<typeof setTimeout>;
  #shouldReconnect = true;
  #options: WebSocketAdapterOptions;

  public get isConnected(): boolean {
    return this.#ws?.readyState === WebSocket.OPEN;
  }

  constructor(options: WebSocketAdapterOptions) {
    this.#options = options;
    this.#connect();
  }

  public send(packet: Packet, _transfer?: TransferableItem[]) {
    if (this.#ws && this.#ws.readyState === WebSocket.OPEN) {
      this.#ws.send(JSON.stringify(packet));
    } else {
      throw new Error('WebSocket not connected');
    }
  }

  public on(event: TransportEvent, fn: Function) {
    this.#listeners[event] = fn;
  }

  public close() {
    console.log('[WebSocketAdapter] close() called');
    this.#shouldReconnect = false;
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = undefined;
    }
    if (this.#ws) {
      this.#ws.close();
      this.#ws = null;
    }
  }

  #connect() {
    try {
      this.#ws = new WebSocket(this.#options.url, this.#options.protocols);

      this.#ws.onopen = () => {
        console.log('[WebSocketAdapter] Connected');
        this.#reconnectAttempts = 0;
        this.#listeners.connect?.();
      };

      this.#ws.onmessage = (event: MessageEvent) => {
        try {
          const packet = JSON.parse(event.data);
          this.#listeners.message?.(packet);
        } catch (error) {
          console.error('[WebSocketAdapter] Failed to parse message:', error);
        }
      };

      this.#ws.onerror = (error: Event & { message?: string; error?: unknown }) => {
        console.error(
          '[WebSocketAdapter] Error:',
          error.message || error.error || error.type,
          'URL:',
          this.#options.url,
        );
      };

      this.#ws.onclose = (event: { code?: number; reason?: string; wasClean?: boolean }) => {
        const closeInfo = {
          code: event?.code,
          reason: event.reason || '(none)',
          wasClean: event.wasClean,
        };

        // Log as warn for abnormal closures
        if (event.code !== 1000 && event.code !== 1001) {
          console.warn('[WebSocketAdapter] Disconnected abnormally', closeInfo);
        } else {
          console.log('[WebSocketAdapter] Disconnected', closeInfo);
        }

        const hadSocket = this.#ws !== null;
        this.#ws = null;

        if (hadSocket) {
          this.#listeners.disconnect?.();
        }

        this.#attemptReconnect();
      };
    } catch (error) {
      console.error('[WebSocketAdapter] Failed to create WebSocket:', error);
      this.#attemptReconnect();
    }
  }

  #attemptReconnect() {
    if (!this.#shouldReconnect) {
      return;
    }

    const maxAttempts = this.#options.maxReconnectAttempts ?? Infinity;
    if (this.#reconnectAttempts >= maxAttempts) {
      console.error('[WebSocketAdapter] Max reconnection attempts reached');
      return;
    }

    const delay = this.#options.reconnectDelay ?? 1000;
    this.#reconnectAttempts++;

    console.log(
      `[WebSocketAdapter] Reconnecting in ${delay}ms (attempt ${this.#reconnectAttempts}/${maxAttempts === Infinity ? '∞' : maxAttempts})`,
    );

    this.#reconnectTimer = setTimeout(() => {
      this.#connect();
    }, delay);
  }
}
