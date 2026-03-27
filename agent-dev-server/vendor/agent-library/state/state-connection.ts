/**
 * StateConnection — outbound WebSocket from agent VM to Platform Server.
 *
 * Provides a bidirectional RPC channel for state synchronization.
 * Transport-agnostic: accepts any object conforming to IStateTransport.
 * The agent-dev-server wires this up with WebSocketAdapter + RpcPeer.
 *
 * Phase 1: establishes connection. Phase 2 adds state operations.
 */

/**
 * Minimal transport interface for state connection.
 * Implemented by RpcPeer in practice.
 */
export interface IStateTransport {
  ask<T = unknown>(payload: unknown, options?: { timeout?: number; retry?: boolean }): Promise<T>;
  notify<T = unknown>(payload: unknown, options?: { requireAck?: boolean }): Promise<void>;
  onMessage(handler: (payload: unknown) => unknown | Promise<unknown>): void;
  onNotify(handler: (payload: unknown) => void): void;
}

/**
 * Minimal closeable transport adapter.
 */
export interface IStateTransportAdapter {
  close(): void;
  readonly isConnected: boolean;
}

export interface StateConnectionOptions {
  transport: IStateTransport;
  adapter: IStateTransportAdapter;
}

export class StateConnection {
  readonly transport: IStateTransport;
  readonly #adapter: IStateTransportAdapter;

  constructor(options: StateConnectionOptions) {
    this.transport = options.transport;
    this.#adapter = options.adapter;
  }

  get isConnected(): boolean {
    return this.#adapter.isConnected;
  }

  close(): void {
    this.#adapter.close();
  }
}
