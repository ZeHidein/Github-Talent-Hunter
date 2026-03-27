/**
 * Lightweight debug logger for AgentStorage.
 * Zero overhead when disabled - no string operations or function calls occur.
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export type StorageLoggerParams = {
  /** Enable debug logging */
  enabled: boolean;
  /** Optional namespace filter (e.g., ['storage:read', 'storage:cache']) */
  namespaces?: string[];
  /** Custom logger implementation (defaults to console) */
  logger?: StorageLogger;
};

export interface StorageLogger {
  debug(namespace: string, message: string, ...args: unknown[]): void;
  info(namespace: string, message: string, ...args: unknown[]): void;
  warn(namespace: string, message: string, ...args: unknown[]): void;
  error(namespace: string, message: string, ...args: unknown[]): void;
}

/** Default console-based logger implementation */
class ConsoleLogger implements StorageLogger {
  debug(namespace: string, message: string, ...args: unknown[]): void {
    console.debug(`[${namespace}]`, message, ...args);
  }

  info(namespace: string, message: string, ...args: unknown[]): void {
    console.info(`[${namespace}]`, message, ...args);
  }

  warn(namespace: string, message: string, ...args: unknown[]): void {
    console.warn(`[${namespace}]`, message, ...args);
  }

  error(namespace: string, message: string, ...args: unknown[]): void {
    console.error(`[${namespace}]`, message, ...args);
  }
}

/** No-op logger for when debugging is disabled */
class NoOpLogger implements StorageLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

/**
 * Debug logger for AgentStorage operations.
 * Provides zero-overhead logging when disabled.
 */
export class DebugLogger {
  #enabled: boolean;
  #namespaces: Set<string> | null;
  #logger: StorageLogger;

  constructor(params: StorageLoggerParams) {
    this.#enabled = params.enabled;
    this.#namespaces = params.namespaces ? new Set(params.namespaces) : null;
    this.#logger = params.enabled ? (params.logger ?? new ConsoleLogger()) : new NoOpLogger();
  }

  /** Check if logging is enabled for a namespace */
  #shouldLog(namespace: string): boolean {
    if (!this.#enabled) {
      return false;
    }
    if (!this.#namespaces) {
      return true;
    }
    return this.#namespaces.has(namespace);
  }

  debug(namespace: string, message: string, ...args: unknown[]): void {
    if (this.#shouldLog(namespace)) {
      this.#logger.debug(namespace, message, ...args);
    }
  }

  info(namespace: string, message: string, ...args: unknown[]): void {
    if (this.#shouldLog(namespace)) {
      this.#logger.info(namespace, message, ...args);
    }
  }

  warn(namespace: string, message: string, ...args: unknown[]): void {
    if (this.#shouldLog(namespace)) {
      this.#logger.warn(namespace, message, ...args);
    }
  }

  error(namespace: string, message: string, ...args: unknown[]): void {
    if (this.#shouldLog(namespace)) {
      this.#logger.error(namespace, message, ...args);
    }
  }

  /** Create a namespaced logger helper for convenience */
  namespace(ns: string) {
    return {
      debug: (message: string, ...args: unknown[]) => this.debug(ns, message, ...args),
      info: (message: string, ...args: unknown[]) => this.info(ns, message, ...args),
      warn: (message: string, ...args: unknown[]) => this.warn(ns, message, ...args),
      error: (message: string, ...args: unknown[]) => this.error(ns, message, ...args),
    };
  }

  /** Check if debugging is enabled */
  get isEnabled(): boolean {
    return this.#enabled;
  }
}
