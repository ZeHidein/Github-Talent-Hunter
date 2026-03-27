import type { ITransport } from './Transport';
import type { Packet, PendingTask, RequestOptions, RpcMessage, TransferableItem } from './types';

export class RpcPeer {
  #handlers = new Map<string, (payload: unknown) => unknown>();
  #pending = new Map<string, PendingTask<unknown>>();
  #buffer: PendingTask<unknown>[] = [];
  #transport: ITransport;

  constructor(transport: ITransport) {
    this.#transport = transport;
    this.#transport.on('message', this.#handleMessage.bind(this));

    this.#transport.on('disconnect', () => {
      console.debug('[RpcPeer] Disconnected. Pausing...');
      this.#recoverTasks();
    });

    this.#transport.on('connect', () => {
      console.log('[RpcPeer] Connected. Flushing buffer...');
      this.#flushBuffer();
    });
  }

  /**
   * Public API: Ask the remote side for something.
   * @template T - Expected response type (defaults to RpcMessage)
   */
  public ask<T = RpcMessage>(
    payload: unknown,
    options: RequestOptions = { retry: true, requireAck: true },
  ): Promise<T> {
    // 1. If Connected: Send immediately
    if (this.#transport.isConnected) {
      return this.#sendInternal(payload, options);
    }

    // 2. If Disconnected & Volatile: Fail
    if (options.retry === false) {
      return Promise.reject(new Error('Transport offline and request is volatile'));
    }

    // 3. Buffer
    const { promise, resolve, reject } = Promise.withResolvers<T>();
    this.#buffer.push({
      id: crypto.randomUUID(),
      payload,
      options,
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    return promise;
  }

  /**
   * Register a handler for incoming requests.
   * Only one main handler needed, dispatch based on payload.cmd manually.
   * @template TRequest - Request payload type (defaults to RpcMessage)
   * @template TResponse - Response type (defaults to unknown)
   */
  public onMessage<TRequest = RpcMessage, TResponse = unknown>(
    fn: (payload: TRequest) => TResponse | Promise<TResponse>,
  ) {
    this.#handlers.set('MAIN', fn as (payload: unknown) => unknown);
  }

  /**
   * Register a handler for incoming notifications.
   * Notifications don't expect a response, so the handler return value is ignored.
   * @template T - Notification payload type (defaults to RpcMessage)
   */
  public onNotify<T = RpcMessage>(fn: (payload: T) => void) {
    this.#handlers.set('NOTIFY', fn as (payload: unknown) => void);
  }

  /**
   * Send a notification (fire-and-forget message).
   * Unlike ask(), this does not wait for a response, only optionally for ACK.
   *
   * @template T - Payload type (defaults to RpcMessage)
   * @param payload - The notification data to send
   * @param options - Optional configuration
   * @returns Promise that resolves when ACK is received (if requireAck: true), or immediately
   *
   * @example
   * ```typescript
   * // Fire-and-forget (no confirmation)
   * await peer.notify({ event: 'userLoggedIn', userId: '123' }, { requireAck: false });
   *
   * // Wait for ACK (reliable delivery)
   * await peer.notify({ event: 'criticalUpdate', data: {...} });
   * ```
   */
  public notify<T = RpcMessage>(
    payload: T,
    options: { requireAck?: boolean; ackTimeout?: number; transfer?: TransferableItem[] } = {},
  ): Promise<void> {
    const requireAck = options.requireAck ?? true;

    // If no ACK required, just send and resolve immediately
    if (!requireAck) {
      const id = crypto.randomUUID();
      try {
        this.#transport.send({ id, type: 'NOTIFY', payload }, options.transfer);
        return Promise.resolve();
      } catch (e) {
        return Promise.reject(e);
      }
    }

    // If ACK required, wait for it
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const id = crypto.randomUUID();

    const ackTimer = setTimeout(() => {
      this.#pending.delete(id);
      reject(new Error('ACK timeout - notification not received by peer'));
    }, options.ackTimeout || 2000);

    const task: PendingTask<void> = {
      id,
      payload,
      options: { requireAck, ackTimeout: options.ackTimeout, transfer: options.transfer },
      resolve: resolve as (value: unknown) => void,
      reject,
      ackTimer,
      ackReceived: false,
    };

    this.#pending.set(id, task as PendingTask<unknown>);

    try {
      this.#transport.send({ id, type: 'NOTIFY', payload }, options.transfer);
    } catch (e) {
      clearTimeout(ackTimer);
      this.#pending.delete(id);
      reject(e);
    }

    return promise;
  }

  /**
   * Send a keepalive signal for a long-running operation.
   * This resets the timeout timer on the client side.
   * Call this periodically (e.g., every 5-8 seconds) during long operations.
   *
   * @param requestId - The ID of the request being processed
   * @example
   * ```typescript
   * peer.onMessage(async (payload) => {
   *   if (payload.cmd === 'longOperation') {
   *     const interval = setInterval(() => {
   *       peer.sendKeepalive(payload.requestId);
   *     }, 5000);
   *
   *     try {
   *       const result = await doLongWork();
   *       return result;
   *     } finally {
   *       clearInterval(interval);
   *     }
   *   }
   * });
   * ```
   */
  public sendKeepalive(requestId: string): void {
    try {
      this.#transport.send({ id: requestId, type: 'KEEPALIVE' });
      // console.log(`[RpcPeer] KEEPALIVE sent for request ${requestId}`);
    } catch (e) {
      console.error(`[RpcPeer] Failed to send KEEPALIVE for request ${requestId}:`, e);
    }
  }

  // --- Internal Logic ---

  #sendInternal<T = unknown>(payload: unknown, options: RequestOptions): Promise<T> {
    const { promise, resolve, reject } = Promise.withResolvers<T>();
    const id = crypto.randomUUID();

    const timer = setTimeout(() => {
      if (this.#pending.has(id)) {
        const task = this.#pending.get(id);
        if (task?.ackTimer) {
          clearTimeout(task.ackTimer);
        }
        this.#pending.delete(id);
        reject(new Error('Timeout waiting for response'));
      }
    }, options.timeout || 10000);

    const task: PendingTask<T> = {
      id,
      payload,
      options,
      resolve: resolve as (value: unknown) => void,
      reject,
      timer,
      ackReceived: false,
    };

    // Set up ACK timeout if required
    if (options.requireAck !== false) {
      const ackTimer = setTimeout(() => {
        if (this.#pending.has(id) && !this.#pending.get(id)?.ackReceived) {
          console.warn(`[RpcPeer] ACK timeout for request ${id}`);
          clearTimeout(timer);
          this.#pending.delete(id);

          // Retry logic: if retry is enabled and we're still connected, re-buffer
          if (options.retry && this.#transport.isConnected) {
            console.log(`[RpcPeer] Retrying request ${id} after ACK timeout`);
            this.#sendInternal<T>(payload, options).then(resolve).catch(reject);
          } else {
            reject(new Error('ACK timeout - message not received by peer'));
          }
        }
      }, options.ackTimeout || 2000);

      task.ackTimer = ackTimer;
    }

    this.#pending.set(id, task as PendingTask<unknown>);

    try {
      this.#transport.send({ id, type: 'REQ', payload }, options.transfer);
    } catch (e) {
      clearTimeout(timer);
      if (task.ackTimer) {
        clearTimeout(task.ackTimer);
      }
      this.#pending.delete(id);
      reject(e);
    }

    return promise;
  }

  #handleMessage(packet: Packet) {
    // A. Handle Protocol-Level ACK
    if (packet.type === 'ACK') {
      const task = this.#pending.get(packet.id);
      if (task) {
        task.ackReceived = true;
        if (task.ackTimer) {
          clearTimeout(task.ackTimer);
          task.ackTimer = undefined;
        }

        // For NOTIFY packets (no timer), resolve immediately after ACK
        if (!task.timer) {
          this.#pending.delete(packet.id);
          task.resolve(undefined);
        }

        // console.log(`[RpcPeer] ACK received for request ${packet.id}`);
      }
      return;
    }

    // B. Handle KEEPALIVE (Long-running operation signal)
    if (packet.type === 'KEEPALIVE') {
      const task = this.#pending.get(packet.id);
      if (task?.timer) {
        // Reset the timeout timer
        clearTimeout(task.timer);
        const timeout = task.options.timeout || 10000;
        task.timer = setTimeout(() => {
          if (this.#pending.has(packet.id)) {
            const t = this.#pending.get(packet.id);
            if (t?.ackTimer) {
              clearTimeout(t.ackTimer);
            }
            this.#pending.delete(packet.id);
            task.reject(new Error('Timeout waiting for response'));
          }
        }, timeout);
        // console.log(`[RpcPeer] KEEPALIVE received for request ${packet.id}, timeout reset`);
      }
      return;
    }

    // C. Handle Response (Application-Level)
    if (packet.type === 'RES') {
      const task = this.#pending.get(packet.id);
      if (task) {
        clearTimeout(task.timer);
        if (task.ackTimer) {
          clearTimeout(task.ackTimer);
        }
        this.#pending.delete(packet.id);
        packet.error ? task.reject(new Error(packet.error)) : task.resolve(packet.payload);
      }
      return;
    }

    // D. Handle Request (Incoming)
    if (packet.type === 'REQ') {
      // Immediately send ACK at protocol level
      try {
        this.#transport.send({ id: packet.id, type: 'ACK' });
        // console.log(`[RpcPeer] ACK sent for request ${packet.id}`);
      } catch (e) {
        console.error(`[RpcPeer] Failed to send ACK for request ${packet.id}:`, e);
      }

      // Then process the request
      const handler = this.#handlers.get('MAIN');
      if (handler) {
        // Support both Sync and Async handlers
        Promise.resolve(handler(packet.payload))
          .then((res) => {
            try {
              this.#transport.send({ id: packet.id, type: 'RES', payload: res });
            } catch (e) {
              console.error(`[RpcPeer] Failed to send response for ${packet.id}:`, e);
            }
          })
          .catch((err) => {
            try {
              this.#transport.send({ id: packet.id, type: 'RES', error: err.message });
            } catch (e) {
              console.error(`[RpcPeer] Failed to send error response for ${packet.id}:`, e);
            }
          });
      }
      return;
    }

    // E. Handle Notification (Incoming)
    if (packet.type === 'NOTIFY') {
      // Immediately send ACK at protocol level
      try {
        this.#transport.send({ id: packet.id, type: 'ACK' });
        // console.log(`[RpcPeer] ACK sent for notification ${packet.id}`);
      } catch (e) {
        console.error(`[RpcPeer] Failed to send ACK for notification ${packet.id}:`, e);
      }

      // Process the notification (no response expected)
      const handler = this.#handlers.get('NOTIFY');
      if (handler) {
        try {
          handler(packet.payload);
        } catch (err) {
          console.error(`[RpcPeer] Error in notification handler:`, err);
        }
      }
      return;
    }
  }

  #flushBuffer() {
    const queue = [...this.#buffer];
    this.#buffer = [];
    queue.forEach((task) => {
      this.#sendInternal(task.payload, task.options)
        .then((res: unknown) => task.resolve(res))
        .catch((err: unknown) => task.reject(err));
    });
  }

  #recoverTasks() {
    // Determine which in-flight tasks should be saved vs killed
    this.#pending.forEach((task) => {
      clearTimeout(task.timer);
      if (task.ackTimer) {
        clearTimeout(task.ackTimer);
      }

      if (task.options.retry) {
        // Add to front of buffer to preserve order
        this.#buffer.unshift(task);
      } else {
        task.reject(new Error('Connection lost during request'));
      }
    });
    this.#pending.clear();
  }
}
