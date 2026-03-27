/**
 * Protocol-agnostic retry loop with configurable backoff.
 *
 * Single-flight, cancelable. At most one loop runs at a time.
 * Calling `start()` while a loop is already running returns the existing promise.
 */

export type RetryLoopDeps = {
  /** Return false to abort the loop early (checked before delay, after delay, and after waitForReady). */
  isStillNeeded: () => boolean;
  /** Optional: await readiness (e.g. WS handshake). Should throw on timeout. */
  waitForReady?: (timeoutMs: number) => Promise<void>;
  /** Perform a single attempt. Return true on success. */
  attemptOnce: () => Promise<boolean>;
};

export type RetryLoopOptions = {
  /** Maximum number of attempts before giving up. Default: 5. */
  maxAttempts?: number;
  /** Base delay between attempts in ms. Default: 2000. */
  delayMs?: number;
  /** Timeout for waitForReady per attempt in ms. Default: 15_000. */
  readyTimeoutMs?: number;
  /** Backoff strategy. 'fixed' = constant delay, 'exponential' = delayMs * 2^attempt. Default: 'fixed'. */
  backoff?: 'fixed' | 'exponential';
  /** Random jitter added to each delay in [0, jitterMs] ms. Default: 0. */
  jitterMs?: number;
};

export class RetryLoop {
  #inFlight?: Promise<void>;
  #abortController?: AbortController;
  #options: Required<RetryLoopOptions>;

  constructor(options: RetryLoopOptions = {}) {
    this.#options = {
      maxAttempts: options.maxAttempts ?? 5,
      delayMs: options.delayMs ?? 2000,
      readyTimeoutMs: options.readyTimeoutMs ?? 15_000,
      backoff: options.backoff ?? 'fixed',
      jitterMs: options.jitterMs ?? 0,
    };
  }

  /**
   * Start the retry loop. Returns the existing promise if already running (single-flight).
   */
  start(deps: RetryLoopDeps): Promise<void> {
    if (this.#inFlight) {
      return this.#inFlight;
    }

    this.#abortController = new AbortController();
    const signal = this.#abortController.signal;

    const run = async () => {
      const { maxAttempts, delayMs, readyTimeoutMs, backoff, jitterMs } = this.#options;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (signal.aborted || !deps.isStillNeeded()) return;

        // Compute delay
        const base = backoff === 'exponential' ? delayMs * 2 ** attempt : delayMs;
        const jitter = jitterMs > 0 ? Math.random() * jitterMs : 0;
        const totalDelay = base + jitter;

        // Cancellable sleep
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, totalDelay);
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(t);
              reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
            },
            { once: true },
          );
        }).catch(() => {});

        if (signal.aborted || !deps.isStillNeeded()) return;

        // Wait for readiness (e.g. WS open)
        if (deps.waitForReady) {
          try {
            await deps.waitForReady(readyTimeoutMs);
          } catch {
            continue;
          }
        }

        if (signal.aborted || !deps.isStillNeeded()) return;

        // Attempt
        const ok = await deps.attemptOnce().catch(() => false);
        if (ok) return;
      }
    };

    this.#inFlight = run().finally(() => {
      this.#inFlight = undefined;
      this.#abortController = undefined;
    });

    return this.#inFlight;
  }

  /** Abort the current loop (if running). */
  cancel(): void {
    this.#abortController?.abort();
  }

  /** Whether a loop is currently in flight. */
  get isRunning(): boolean {
    return this.#inFlight !== undefined;
  }
}
