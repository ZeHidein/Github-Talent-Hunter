/**
 * StreamThrottler
 *
 * Generic utility for throttling, batching, and merging async iterables.
 * Useful for reducing event frequency when streaming agent content to clients.
 *
 * @example
 * ```typescript
 * const throttler = new StreamThrottler({ batchTimeoutMs: 16 });
 *
 * // Merge tool and reasoning deltas
 * for await (const content of throttler.mergeDeltas(stream, {
 *   getKey: (e) => {
 *     if (e.type === ContentType.Text && e.isReasoning) {
 *       return `reasoning:${e.messageId}`;
 *     }
 *     return null;
 *   },
 *   getDelta: (e) => e.type === ContentType.Text ? e.text : e.delta ?? '',
 *   mergeDelta: (e, merged) => ({ ...e, delta: merged }),
 * })) {
 *   sendToClient(content);
 * }
 * ```
 */

export interface StreamThrottlerOptions {
  /**
   * Minimum time between sends (in milliseconds).
   * @default 16 (~60fps)
   */
  throttleMs?: number;

  /**
   * Maximum number of items to accumulate in a batch.
   * If specified, enables batching mode.
   */
  batchSize?: number;

  /**
   * Maximum time to wait before flushing a batch (in milliseconds).
   * @default 50
   */
  batchTimeoutMs?: number;
}

export class StreamThrottler<T = unknown> {
  private readonly throttleMs: number;
  private readonly batchSize?: number;
  private readonly batchTimeoutMs: number;

  constructor(options: StreamThrottlerOptions = {}) {
    this.throttleMs = options.throttleMs ?? 16;
    this.batchSize = options.batchSize;
    this.batchTimeoutMs = options.batchTimeoutMs ?? 50;
  }

  /**
   * Throttle a stream by time.
   * Ensures minimum time gap between emitted items.
   */
  async *throttle<U>(stream: AsyncIterable<U>): AsyncIterableIterator<U> {
    let lastSendTime = 0;

    for await (const item of stream) {
      const now = Date.now();
      const timeSinceLastSend = now - lastSendTime;

      if (lastSendTime > 0 && timeSinceLastSend < this.throttleMs) {
        await new Promise((resolve) => setTimeout(resolve, this.throttleMs - timeSinceLastSend));
      }

      yield item;
      lastSendTime = Date.now();
    }
  }

  /**
   * Batch items from a stream.
   * Accumulates items and yields arrays when batch size or timeout is reached.
   */
  async *batch(stream: AsyncIterable<T>): AsyncIterableIterator<T[]> {
    const maxSize = this.batchSize ?? 10;
    let buffer: T[] = [];
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const flushBuffer = (): T[] | null => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (buffer.length === 0) {
        return null;
      }
      const batch = buffer;
      buffer = [];
      return batch;
    };

    try {
      for await (const item of stream) {
        buffer.push(item);

        if (buffer.length >= maxSize) {
          const batch = flushBuffer();
          if (batch) {
            yield batch;
          }
          continue;
        }

        if (!timeoutId) {
          timeoutId = setTimeout(() => {
            timeoutId = null;
          }, this.batchTimeoutMs);
        }

        if (!timeoutId && buffer.length > 0) {
          const batch = flushBuffer();
          if (batch) {
            yield batch;
          }
        }
      }

      const finalBatch = flushBuffer();
      if (finalBatch) {
        yield finalBatch;
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Batch with time-based flushing.
   * More reliable than batch() for ensuring timely delivery.
   */
  async *batchWithTimer(stream: AsyncIterable<T>): AsyncIterableIterator<T[]> {
    const maxSize = this.batchSize ?? 10;
    let buffer: T[] = [];
    let lastFlushTime = Date.now();

    for await (const item of stream) {
      buffer.push(item);
      const now = Date.now();

      const shouldFlush = buffer.length >= maxSize || now - lastFlushTime >= this.batchTimeoutMs;

      if (shouldFlush) {
        yield buffer;
        buffer = [];
        lastFlushTime = Date.now();
      }
    }

    if (buffer.length > 0) {
      yield buffer;
    }
  }

  /**
   * Throttle and batch combined.
   */
  async *throttleAndBatch(stream: AsyncIterable<T>): AsyncIterableIterator<T[]> {
    yield* this.throttle<T[]>(this.batchWithTimer(stream));
  }

  /**
   * Merge delta events by key.
   * Combines multiple delta events into single events with merged content.
   * Preserves event ordering by flushing buffer before any non-delta event.
   *
   * @param stream - Input stream of events
   * @param options.getKey - Function to get grouping key. Return null to pass through without merging.
   * @param options.getDelta - Function to extract delta string from event
   * @param options.mergeDelta - Function to create merged event with combined delta
   * @param options.flushTimeoutMs - Time to wait before flushing accumulated deltas
   */
  async *mergeDeltas<U>(
    stream: AsyncIterable<U>,
    options: {
      getKey: (item: U) => string | null;
      getDelta: (item: U) => string;
      mergeDelta: (item: U, mergedDelta: string) => U;
      flushTimeoutMs?: number;
    },
  ): AsyncIterableIterator<U> {
    const { getKey, getDelta, mergeDelta, flushTimeoutMs = this.batchTimeoutMs } = options;

    const buffer = new Map<string, { firstItem: U; delta: string }>();

    function* flushBuffer(): Generator<U> {
      for (const [, { firstItem, delta }] of buffer) {
        yield mergeDelta(firstItem, delta);
      }
      buffer.clear();
    }

    const iterator = stream[Symbol.asyncIterator]();
    let pendingNext: Promise<IteratorResult<U>> | null = null;

    while (true) {
      const nextPromise: Promise<IteratorResult<U>> = pendingNext ?? iterator.next();
      pendingNext = null;

      let result: IteratorResult<U>;
      if (buffer.size > 0) {
        const timeoutPromise = new Promise<'timeout'>((resolve) =>
          setTimeout(() => resolve('timeout'), flushTimeoutMs),
        );
        const raceResult = await Promise.race([nextPromise, timeoutPromise]);

        if (raceResult === 'timeout') {
          yield* flushBuffer();
          pendingNext = nextPromise;
          continue;
        }
        result = raceResult;
      } else {
        result = await nextPromise;
      }

      if (result.done) {
        break;
      }

      const item = result.value;
      const key = getKey(item);

      if (key === null) {
        yield* flushBuffer();
        yield item;
      } else {
        const existing = buffer.get(key);
        if (existing) {
          existing.delta += getDelta(item);
        } else {
          buffer.set(key, { firstItem: item, delta: getDelta(item) });
        }
      }
    }

    yield* flushBuffer();
  }
}
