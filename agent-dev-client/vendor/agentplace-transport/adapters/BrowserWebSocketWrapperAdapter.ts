import type { ITransport, TransportEvent } from '../Transport';
import type { Packet, TransferableItem } from '../types';

/**
 * Wraps an already-open browser WebSocket as ITransport.
 *
 * Unlike WebSocketAdapter (which creates and manages its own WebSocket),
 * this adapter wraps an existing WebSocket you provide. You remain in
 * control of connection lifecycle, reconnection, and URL management.
 *
 * Browser counterpart to WebSocketServerAdapter (which wraps Node.js ws).
 */
export class BrowserWebSocketWrapperAdapter implements ITransport {
  #ws: WebSocket;
  #listeners: Partial<Record<TransportEvent, Function>> = {};

  get isConnected(): boolean {
    return this.#ws.readyState === WebSocket.OPEN;
  }

  constructor(ws: WebSocket) {
    this.#ws = ws;

    ws.addEventListener('message', (event: MessageEvent) => {
      try {
        const packet = JSON.parse(event.data) as Packet;
        this.#listeners.message?.(packet);
      } catch (e) {
        console.error('[BrowserWebSocketWrapperAdapter] Failed to parse message:', e);
      }
    });

    ws.addEventListener('close', () => {
      this.#listeners.disconnect?.();
    });

    ws.addEventListener('error', (event: Event) => {
      console.error('[BrowserWebSocketWrapperAdapter] WebSocket error:', event);
    });

    // Defer connect emit so RpcPeer can register handlers first
    if (ws.readyState === WebSocket.OPEN) {
      setTimeout(() => this.#listeners.connect?.(), 0);
    } else {
      ws.addEventListener('open', () => {
        this.#listeners.connect?.();
      });
    }
  }

  send(packet: Packet, _transfer?: TransferableItem[]): void {
    if (this.#ws.readyState === WebSocket.OPEN) {
      this.#ws.send(JSON.stringify(packet));
    }
  }

  on(event: TransportEvent, fn: Function): void {
    this.#listeners[event] = fn;
  }
}
