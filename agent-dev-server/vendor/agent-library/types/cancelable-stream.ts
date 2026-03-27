import EventEmitter from 'node:events';

export type CancelableStreamEvent = 'next' | 'end' | 'abort';

export class CancelableStream<T> extends EventEmitter implements AsyncIterable<T> {
  private readonly dataFactory: (abortSignal: AbortSignal) => Promise<AsyncIterable<T>>;
  private readonly controller: AbortController;
  private iteratorPromise: Promise<AsyncIterator<T>> | null = null;
  private stream: AsyncIterable<T> | null = null;

  constructor(dataFactory: (abortSignal: AbortSignal) => Promise<AsyncIterable<T>>) {
    super();
    this.controller = new AbortController();
    this.controller.signal.onabort = () => {
      this.emit('abort');
    };
    this.dataFactory = dataFactory;
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    if (this.isAborted()) {
      return {
        next: async () => ({ done: true, value: undefined }),
        return: async () => ({ done: true, value: undefined }),
        throw: async () => {
          throw new Error('Iterator does not support throw.');
        },
      };
    }

    if (!this.iteratorPromise) {
      this.iteratorPromise = this.dataFactory(this.controller.signal).then((iterable) => {
        this.stream = iterable;
        return iterable[Symbol.asyncIterator]();
      });
    }

    const getIterator = async () => {
      const iterator = await this.iteratorPromise!;
      return {
        next: async (arg?: unknown) => {
          if (this.isAborted()) {
            return { done: true as const, value: undefined };
          }
          const result = await iterator.next(arg);
          if (result.done) {
            this.emit('end');
          } else {
            this.emit('next', result.value);
          }
          return result;
        },
        return: async (arg?: unknown) => {
          if (typeof iterator.return === 'function') {
            return iterator.return(arg);
          }
          return { done: true as const, value: undefined };
        },
        throw: async (arg?: unknown) => {
          if (typeof iterator.throw === 'function') {
            return iterator.throw(arg);
          }
          throw new Error('Iterator does not support throw.');
        },
      };
    };

    return {
      next: (arg?: unknown) => getIterator().then((it) => it.next(arg)),
      return: (arg?: unknown) => getIterator().then((it) => it.return(arg)),
      throw: (arg?: unknown) => getIterator().then((it) => it.throw(arg)),
    };
  }

  public override on(event: CancelableStreamEvent, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }

  public abort(): void {
    this.controller.abort();
  }

  public isAborted(): boolean {
    return this.controller.signal.aborted;
  }

  public getStream(): AsyncIterable<T> | null {
    return this.stream;
  }

  public static fromArray<T>(array: T[]): CancelableStream<T> {
    return new CancelableStream<T>(async (abortSignal) =>
      CancelableStream.generateStream(array, abortSignal),
    );
  }

  private static async *generateStream<T>(array: T[], abortSignal: AbortSignal): AsyncIterable<T> {
    for (const item of array) {
      if (abortSignal.aborted) {
        return;
      }
      yield item;
    }
  }
}
