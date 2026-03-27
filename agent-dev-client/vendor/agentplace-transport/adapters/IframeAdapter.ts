import type { ITransport, TransportEvent } from '../Transport';
import type { Packet, TransferableItem } from '../types';

type ListenerMap = {
  message?: (packet: Packet) => void;
  connect?: () => void;
  disconnect?: () => void;
};

/**
 * Base class for Iframe Transport
 * Contains all shared logic for message passing and port management
 */
abstract class BaseIframeAdapter implements ITransport {
  #port: MessagePort | null = null;
  #listeners: ListenerMap = {};
  public isConnected = false;

  public send(packet: Packet, transfer?: TransferableItem[]) {
    if (this.#port) {
      // Cast to Transferable[] for DOM API - this adapter is browser-only
      this.#port.postMessage(packet, (transfer || []) as Transferable[]);
    }
  }

  public on(event: 'message', fn: (packet: Packet) => void): void;
  public on(event: 'connect', fn: () => void): void;
  public on(event: 'disconnect', fn: () => void): void;
  public on(event: TransportEvent, fn: ((packet: Packet) => void) | (() => void)) {
    // Type assertion is safe here because the overloads ensure type safety
    if (event === 'message') {
      this.#listeners[event] = fn as (packet: Packet) => void;
    } else if (event === 'connect') {
      this.#listeners[event] = fn as () => void;
    } else if (event === 'disconnect') {
      this.#listeners[event] = fn as () => void;
    }
  }

  protected setupPort(port: MessagePort) {
    this.#port = port;
    this.#port.onmessage = (e) => this.#listeners.message?.(e.data);
    this.#port.start();
    this.isConnected = true;
  }

  protected notifyConnect() {
    this.#listeners.connect?.();
  }

  protected disconnect() {
    if (!this.isConnected) {
      return;
    }
    this.isConnected = false;
    this.#port?.close();
    this.#port = null;
    this.#listeners.disconnect?.();
  }

  protected closePort() {
    this.#port?.close();
  }
}

/**
 * HOST: Used by the Builder (Parent Window)
 * Manages the connection lifecycle via handshake
 */
export class IframeParentAdapter extends BaseIframeAdapter {
  #iframe: HTMLIFrameElement;
  #onMessage: ((e: MessageEvent) => void) | null = null;

  constructor(iframe: HTMLIFrameElement) {
    super();
    this.#iframe = iframe;
    this.#initialize();
  }

  #initialize() {
    // Listen for handshake requests from the iframe
    // When we receive SYN, it means the iframe wants a (new) connection
    this.#onMessage = (e: MessageEvent) => {
      if (e.source === this.#iframe.contentWindow && e.data === 'SYN') {
        this.#connect();
      }
    };
    window.addEventListener('message', this.#onMessage);

    // Proactively try to connect if iframe is already loaded.
    // This handles the case where the parent adapter is recreated (e.g., HMR)
    // but the iframe child is already running with a persistent ACK listener.
    if (this.#iframe.contentWindow) {
      this.#connect();
    }
  }

  /**
   * Remove the global message listener. Call this when disposing the adapter
   * to prevent leaked listeners (e.g., during HMR).
   */
  public destroy() {
    if (this.#onMessage) {
      window.removeEventListener('message', this.#onMessage);
      this.#onMessage = null;
    }
    this.disconnect();
  }

  #connect() {
    // If there's an old connection, close it first
    if (this.isConnected) {
      this.disconnect();
    }

    // Create new MessageChannel for communication
    const channel = new MessageChannel();
    this.setupPort(channel.port1);

    // Send the other port to the iframe
    this.#iframe.contentWindow?.postMessage('ACK', '*', [channel.port2]);

    this.notifyConnect();
  }
}

/**
 * CLIENT: Used Inside Iframe
 */
export class IframeChildAdapter extends BaseIframeAdapter {
  constructor() {
    super();
    this.#initialize();
  }

  #initialize() {
    // Send handshake request to parent
    window.parent.postMessage('SYN', '*');

    // Wait for ACK with the MessagePort
    window.addEventListener('message', (e) => {
      if (e.data === 'ACK' && e.ports[0]) {
        this.#connect(e.ports[0]);
      }
    });
  }

  #connect(port: MessagePort) {
    // If reconnecting, close old port first
    if (this.isConnected) {
      this.closePort();
    }

    this.setupPort(port);
    this.notifyConnect();
  }
}
