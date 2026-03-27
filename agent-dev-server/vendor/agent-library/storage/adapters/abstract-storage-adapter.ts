import type { RawFileMetadata, StorageWriteOptions } from '../types.ts';
import type { DebugLogger } from '../storage-logger.ts';

/** Options passed to adapter writeFile method */
export type AdapterWriteOptions = Pick<StorageWriteOptions, 'compression'>;

/**
 * Abstract base class for all storage adapters.
 *
 * Adapters are pure storage implementations without caching.
 * Caching is handled by AgentStorage based on adapter flags.
 */
export abstract class AbstractStorageAdapter {
  protected logger?: DebugLogger;
  protected adapterName?: string;

  constructor(logger?: DebugLogger) {
    this.logger = logger;
  }

  /** Set the logger for this adapter (called by AgentStorage) */
  setLogger(logger: DebugLogger, adapterName?: string): void {
    this.logger = logger;
    this.adapterName = adapterName;
  }

  // ============================================================================
  // Adapter Properties (must be implemented by subclasses)
  // ============================================================================

  /** Whether this adapter supports write operations */
  abstract get writable(): boolean;

  /** Whether AgentStorage should cache listFiles() results */
  abstract get cacheableList(): boolean;

  /** Whether AgentStorage should cache readFile() content */
  abstract get cacheableContent(): boolean;

  // ============================================================================
  // Storage Operations (must be implemented by subclasses)
  // ============================================================================

  /**
   * Read file content.
   * @param filePath - Path to the file
   * @returns Buffer if found, null if not found
   */
  abstract readFile(filePath: string): Promise<Buffer | null>;

  /**
   * Write file content.
   * @param filePath - Path to the file
   * @param content - File content
   * @param contentType - MIME type
   * @param options - Write options (e.g., compression)
   * @throws Error if adapter is not writable
   */
  abstract writeFile(
    filePath: string,
    content: Buffer,
    contentType: string,
    options?: AdapterWriteOptions,
  ): Promise<void>;

  /**
   * Delete a file.
   * @param filePath - Path to the file
   * @throws Error if adapter is not writable
   */
  abstract deleteFile(filePath: string): Promise<void>;

  /**
   * List all files.
   * @returns Array of file metadata
   */
  abstract listFiles(): Promise<RawFileMetadata[]>;

  /**
   * Check if file exists.
   * @param filePath - Path to the file
   * @returns true if file exists
   */
  abstract exists(filePath: string): Promise<boolean>;
}
