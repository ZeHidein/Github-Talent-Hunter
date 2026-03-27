import type { Packet, TransferableItem } from './types';

export type TransportEvent = 'connect' | 'disconnect' | 'message';

export interface ITransport {
  /** Is the connection currently open and ready? */
  isConnected: boolean;

  /** Send a packet. Adapter handles the low-level transfer logic. */
  send(packet: Packet, transfer?: TransferableItem[]): void;

  /** Lifecycle event listeners */
  on(event: 'message', fn: (packet: Packet) => void): void;
  on(event: 'connect', fn: () => void): void;
  on(event: 'disconnect', fn: () => void): void;
}
