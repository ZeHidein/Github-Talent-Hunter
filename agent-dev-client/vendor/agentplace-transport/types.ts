/**
 * Transferable items for postMessage (zero-copy transfer).
 * In browsers: ArrayBuffer, MessagePort, etc.
 * In Node.js: ArrayBuffer from worker_threads.
 * We use `unknown` to avoid DOM/Node type dependencies.
 */
export type TransferableItem = unknown;

/**
 * Default RPC message structure
 * Can be used as generic default for type-safe messaging
 */
export type RpcMessage = {
  type: string;
  message: unknown;
};

export type Packet = {
  id: string;
  type: 'REQ' | 'RES' | 'ACK' | 'KEEPALIVE' | 'NOTIFY';
  payload?: unknown;
  error?: string;
};

export type RequestOptions = {
  /** Time in ms to wait for a response before throwing timeout error */
  timeout?: number;
  /** Time in ms to wait for ACK before considering message lost. Default: 2000ms */
  ackTimeout?: number;
  /** If true, require ACK for reliability. Default: true */
  requireAck?: boolean;
  /** If true, buffer request when offline. If false, fail immediately. Default: true */
  retry?: boolean;
  /** List of ArrayBuffers/Ports to transfer ownership (Zero-Copy) */
  transfer?: TransferableItem[];
};

export type PendingTask<T = unknown> = {
  id: string;
  payload: unknown;
  options: RequestOptions;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
  ackTimer?: ReturnType<typeof setTimeout>;
  ackReceived?: boolean;
};
