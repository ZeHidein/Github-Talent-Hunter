import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { AbstractStorageAdapter, type AdapterWriteOptions } from './abstract-storage-adapter.ts';
import type { RawFileMetadata } from '../types.ts';
import { StorageLocalError } from '../types.ts';
import { getMimeType } from '../mime-utils.ts';

export type LocalFileSystemAdapterParams = {
  /** Root directory path for local storage */
  basePath: string;

  /** Optional: whether the adapter is writable (default: false) */
  isWritable?: boolean;
};

/**
 * Storage adapter for local filesystem (readonly).
 *
 * - writable: false (local files are readonly)
 * - cacheableList: true (directory scanning is expensive)
 * - cacheableContent: false (local file reads are fast)
 */
export class LocalFileSystemAdapter extends AbstractStorageAdapter {
  #basePath: string;
  #isWritable: boolean = false;

  constructor(params: LocalFileSystemAdapterParams) {
    super();
    this.#basePath = path.resolve(params.basePath);
    if (params.isWritable !== undefined) {
      this.#isWritable = params.isWritable;
    }
  }

  // ============================================================================
  // Adapter Properties
  // ============================================================================

  get writable(): boolean {
    return this.#isWritable;
  }

  get cacheableList(): boolean {
    return true;
  }

  get cacheableContent(): boolean {
    return false;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /** Resolve relative path to absolute path within base directory */
  #resolvePath(relativePath: string): string {
    const normalizedPath = relativePath.replace(/\\/g, '/');
    const resolved = path.resolve(this.#basePath, normalizedPath);

    // Security: prevent path traversal outside base directory
    if (!resolved.startsWith(this.#basePath)) {
      throw new StorageLocalError(
        `Path traversal attempt: ${relativePath}`,
        new Error('Path traversal'),
      );
    }

    return resolved;
  }

  // ============================================================================
  // Storage Operations
  // ============================================================================

  async readFile(filePath: string): Promise<Buffer | null> {
    const absolutePath = this.#resolvePath(filePath);
    this.logger?.debug('storage:adapter:fs', `Reading file: '${filePath}' (${absolutePath})`);

    try {
      const content = await fs.readFile(absolutePath);
      this.logger?.debug(
        'storage:adapter:fs',
        `Read successful: '${filePath}' (${content.length} bytes)`,
      );
      return content;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger?.debug('storage:adapter:fs', `File not found: '${filePath}'`);
        return null;
      }
      this.logger?.error('storage:adapter:fs', `Read failed: '${filePath}'`, error);
      throw new StorageLocalError(`Failed to read file: ${filePath}`, error as Error);
    }
  }

  async writeFile(
    filePath: string,
    content: Buffer,
    _contentType: string,
    _options?: AdapterWriteOptions,
  ): Promise<void> {
    this.logger?.warn(
      'storage:adapter:fs',
      `Write attempt on readonly adapter: '${filePath}' (${content.length} bytes)`,
    );
    throw new StorageLocalError(
      'LocalFileSystemAdapter is readonly',
      new Error('Write not supported'),
    );
  }

  async deleteFile(filePath: string): Promise<void> {
    this.logger?.warn('storage:adapter:fs', `Delete attempt on readonly adapter: '${filePath}'`);
    throw new StorageLocalError(
      'LocalFileSystemAdapter is readonly',
      new Error('Delete not supported'),
    );
  }

  async listFiles(): Promise<RawFileMetadata[]> {
    this.logger?.debug('storage:adapter:fs', `Listing files from: ${this.#basePath}`);

    try {
      const entries = await fs.readdir(this.#basePath, {
        withFileTypes: true,
        recursive: true,
      });

      const files: RawFileMetadata[] = [];

      for (const entry of entries) {
        if (entry.isFile()) {
          // entry.parentPath is available in Node 20+ with recursive: true
          const relativePath = entry.parentPath
            ? path.relative(this.#basePath, path.join(entry.parentPath, entry.name))
            : entry.name;

          const fullPath = path.join(this.#basePath, relativePath);
          const stats = await fs.stat(fullPath);

          files.push({
            path: relativePath.replace(/\\/g, '/'), // Normalize to forward slashes
            size: stats.size,
            contentType: getMimeType(entry.name),
          });
        }
      }

      this.logger?.debug('storage:adapter:fs', `List complete: ${files.length} files`);
      return files;
    } catch (error) {
      this.logger?.error('storage:adapter:fs', `List failed: ${this.#basePath}`, error);
      throw new StorageLocalError(`Failed to list files in ${this.#basePath}`, error as Error);
    }
  }

  async exists(filePath: string): Promise<boolean> {
    const absolutePath = this.#resolvePath(filePath);

    try {
      await fs.access(absolutePath);
      this.logger?.debug('storage:adapter:fs', `Exists check: '${filePath}' = true`);
      return true;
    } catch {
      this.logger?.debug('storage:adapter:fs', `Exists check: '${filePath}' = false`);
      return false;
    }
  }
}
