import { AbstractStorageAdapter, type AdapterWriteOptions } from './abstract-storage-adapter.ts';
import type { RawFileMetadata } from '../types.ts';
import { StorageFileNotFoundError } from '../types.ts';
import { getMimeType } from '../mime-utils.ts';

type StoredFile = {
  content: Buffer;
  contentType: string;
};

/**
 * In-memory storage adapter for testing.
 *
 * - writable: true
 * - cacheableList: false (already in memory)
 * - cacheableContent: false (already in memory)
 *
 * Use this adapter in tests to avoid network calls and filesystem access.
 */
export class InMemoryAdapter extends AbstractStorageAdapter {
  #files: Map<string, StoredFile> = new Map();

  constructor(initialFiles?: Record<string, Buffer>) {
    super();
    if (initialFiles) {
      for (const [path, content] of Object.entries(initialFiles)) {
        this.#files.set(path, {
          content,
          contentType: getMimeType(path),
        });
      }
    }
  }

  // ============================================================================
  // Adapter Properties
  // ============================================================================

  get writable(): boolean {
    return true;
  }

  get cacheableList(): boolean {
    return false;
  }

  get cacheableContent(): boolean {
    return false;
  }

  // ============================================================================
  // Storage Operations
  // ============================================================================

  async readFile(filePath: string): Promise<Buffer | null> {
    this.logger?.debug('storage:adapter:memory', `Reading file: '${filePath}'`);
    const file = this.#files.get(filePath);

    if (file) {
      this.logger?.debug(
        'storage:adapter:memory',
        `Read successful: '${filePath}' (${file.content.length} bytes)`,
      );
      return file.content;
    }

    this.logger?.debug('storage:adapter:memory', `File not found: '${filePath}'`);
    return null;
  }

  async writeFile(
    filePath: string,
    content: Buffer,
    contentType: string,
    _options?: AdapterWriteOptions,
  ): Promise<void> {
    this.logger?.debug(
      'storage:adapter:memory',
      `Writing file: '${filePath}' (${content.length} bytes, ${contentType})`,
    );

    // InMemoryAdapter ignores compression option - stores uncompressed in memory
    this.#files.set(filePath, { content, contentType });

    this.logger?.info(
      'storage:adapter:memory',
      `Write successful: '${filePath}' (${content.length} bytes)`,
    );
  }

  async deleteFile(filePath: string): Promise<void> {
    this.logger?.debug('storage:adapter:memory', `Deleting file: '${filePath}'`);

    if (!this.#files.has(filePath)) {
      this.logger?.error('storage:adapter:memory', `Delete failed: '${filePath}' not found`);
      throw new StorageFileNotFoundError(filePath, []);
    }

    this.#files.delete(filePath);
    this.logger?.info('storage:adapter:memory', `Delete successful: '${filePath}'`);
  }

  async listFiles(): Promise<RawFileMetadata[]> {
    this.logger?.debug('storage:adapter:memory', 'Listing all files');

    const files: RawFileMetadata[] = [];

    for (const [path, file] of this.#files) {
      files.push({
        path,
        size: file.content.length,
        contentType: file.contentType,
      });
    }

    this.logger?.debug('storage:adapter:memory', `List complete: ${files.length} files`);
    return files;
  }

  async exists(filePath: string): Promise<boolean> {
    const exists = this.#files.has(filePath);
    this.logger?.debug('storage:adapter:memory', `Exists check: '${filePath}' = ${exists}`);
    return exists;
  }

  // ============================================================================
  // Test Helpers
  // ============================================================================

  /** Clear all files (useful for test cleanup) */
  clear(): void {
    this.#files.clear();
  }

  /** Get current file count */
  get fileCount(): number {
    return this.#files.size;
  }

  /** Set a file directly (convenience for test setup) */
  setFile(filePath: string, content: Buffer | string): void {
    const buffer = typeof content === 'string' ? Buffer.from(content) : content;
    this.#files.set(filePath, {
      content: buffer,
      contentType: getMimeType(filePath),
    });
  }
}
