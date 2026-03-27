import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import type { RawFileMetadata } from './types.ts';
import type { DebugLogger } from './storage-logger.ts';

export type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

export type StorageCacheParams = {
  /** Time-to-live in milliseconds (default: 5 minutes) */
  ttl?: number;
  /** Custom cache directory (default: os.tmpdir()/agent-storage-cache) */
  cacheDir?: string;
  /** Debug logger instance */
  logger?: DebugLogger;
};

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

export class StorageCache {
  /** File list cache (in memory) - keyed by adapter name */
  #fileListCache: Map<string, CacheEntry<RawFileMetadata[]>> = new Map();
  /** Content metadata cache (in memory) - tracks timestamps for disk files */
  #contentMetaCache: Map<string, number> = new Map();
  #ttl: number;
  #cacheDir: string;
  #initialized = false;
  #logger?: DebugLogger;

  constructor(params: StorageCacheParams = {}) {
    this.#ttl = params.ttl ?? DEFAULT_TTL;
    this.#cacheDir = params.cacheDir ?? path.join(os.tmpdir(), 'agent-storage-cache');
    this.#logger = params.logger;
  }

  /** Ensure cache directory exists */
  async #ensureCacheDir(): Promise<void> {
    if (this.#initialized) {
      return;
    }
    try {
      await fs.mkdir(this.#cacheDir, { recursive: true });
      this.#initialized = true;
    } catch {
      // Directory might already exist
      this.#initialized = true;
    }
  }

  /** Generate cache key for file list */
  #listKey(adapterName: string): string {
    return `list:${adapterName}`;
  }

  /** Generate cache key for content metadata */
  #contentKey(filePath: string, adapterName: string): string {
    return `${adapterName}:${filePath}`;
  }

  /** Generate file path for cached content on disk */
  #contentFilePath(filePath: string, adapterName: string): string {
    // Hash the path to avoid filesystem path issues
    const hash = crypto.createHash('sha256').update(`${adapterName}:${filePath}`).digest('hex');
    return path.join(this.#cacheDir, `${hash}.cache`);
  }

  /** Check if timestamp is still valid */
  #isTimestampValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.#ttl;
  }

  // ---- File List Cache (in-memory) ----

  getFileList(adapterName: string): RawFileMetadata[] | null {
    const entry = this.#fileListCache.get(this.#listKey(adapterName));

    if (!entry) {
      return null;
    }

    const isValid = this.#isTimestampValid(entry.timestamp);
    const age = Date.now() - entry.timestamp;

    if (isValid) {
      this.#logger?.debug(
        'storage:cache',
        `File list cache hit: '${adapterName}' (age: ${age}ms, TTL: ${this.#ttl}ms)`,
      );
      return entry.data;
    }

    this.#logger?.debug(
      'storage:cache',
      `File list cache expired: '${adapterName}' (age: ${age}ms, TTL: ${this.#ttl}ms)`,
    );

    return null;
  }

  setFileList(adapterName: string, files: RawFileMetadata[]): void {
    this.#fileListCache.set(this.#listKey(adapterName), {
      data: files,
      timestamp: Date.now(),
    });
    this.#logger?.debug(
      'storage:cache',
      `File list cached: '${adapterName}' (${files.length} files, TTL: ${this.#ttl}ms)`,
    );
  }

  // ---- File Content Cache (disk content, in-memory metadata) ----

  async getFileContent(filePath: string, adapterName: string): Promise<Buffer | null> {
    const key = this.#contentKey(filePath, adapterName);
    const timestamp = this.#contentMetaCache.get(key);

    // Check if we have metadata and it's still valid
    if (timestamp === undefined || !this.#isTimestampValid(timestamp)) {
      // Expired or not cached - clean up if exists
      if (timestamp !== undefined) {
        const age = Date.now() - timestamp;
        this.#logger?.debug(
          'storage:cache',
          `Content cache expired: '${filePath}' @ '${adapterName}' (age: ${age}ms, TTL: ${this.#ttl}ms)`,
        );
        this.#contentMetaCache.delete(key);
        await this.#deleteContentFile(filePath, adapterName);
      }
      return null;
    }

    // Try to read from disk
    const diskPath = this.#contentFilePath(filePath, adapterName);
    try {
      const content = await fs.readFile(diskPath);
      const age = Date.now() - timestamp;
      this.#logger?.debug(
        'storage:cache',
        `Content cache hit (disk): '${filePath}' @ '${adapterName}' (${content.length} bytes, age: ${age}ms)`,
      );
      return content;
    } catch (err) {
      // File doesn't exist - clean up metadata
      this.#logger?.warn(
        'storage:cache',
        `Content cache metadata exists but disk file missing: '${filePath}' @ '${adapterName}'`,
      );
      this.#contentMetaCache.delete(key);
      return null;
    }
  }

  async setFileContent(filePath: string, adapterName: string, content: Buffer): Promise<void> {
    await this.#ensureCacheDir();

    const key = this.#contentKey(filePath, adapterName);
    const diskPath = this.#contentFilePath(filePath, adapterName);

    // Write content to disk
    try {
      await fs.writeFile(diskPath, content);

      // Store timestamp in memory
      this.#contentMetaCache.set(key, Date.now());

      this.#logger?.debug(
        'storage:cache',
        `Content cached to disk: '${filePath}' @ '${adapterName}' (${content.length} bytes, path: ${diskPath})`,
      );
    } catch (err) {
      this.#logger?.error(
        'storage:cache',
        `Failed to cache content to disk: '${filePath}' @ '${adapterName}'`,
        err,
      );
    }
  }

  // ---- Invalidation ----

  /** Invalidate file list cache for an adapter */
  invalidateFileList(adapterName: string): void {
    const hadEntry = this.#fileListCache.has(this.#listKey(adapterName));
    this.#fileListCache.delete(this.#listKey(adapterName));
    if (hadEntry) {
      this.#logger?.debug('storage:cache', `Invalidated file list: '${adapterName}'`);
    }
  }

  /** Invalidate file content cache for a specific file */
  async invalidateFileContent(filePath: string, adapterName: string): Promise<void> {
    const key = this.#contentKey(filePath, adapterName);
    const hadEntry = this.#contentMetaCache.has(key);
    this.#contentMetaCache.delete(key);
    await this.#deleteContentFile(filePath, adapterName);
    if (hadEntry) {
      this.#logger?.debug('storage:cache', `Invalidated content: '${filePath}' @ '${adapterName}'`);
    }
  }

  /** Delete content cache file from disk */
  async #deleteContentFile(filePath: string, adapterName: string): Promise<void> {
    const diskPath = this.#contentFilePath(filePath, adapterName);
    try {
      await fs.unlink(diskPath);
      this.#logger?.debug('storage:cache', `Deleted cache file from disk: ${diskPath}`);
    } catch {
      // File might not exist - ignore
    }
  }

  /** Invalidate all caches for an adapter */
  async invalidateAdapter(adapterName: string): Promise<void> {
    this.invalidateFileList(adapterName);

    // Remove all content entries for this adapter from metadata cache
    const prefix = `${adapterName}:`;
    let count = 0;
    for (const key of this.#contentMetaCache.keys()) {
      if (key.startsWith(prefix)) {
        this.#contentMetaCache.delete(key);
        count++;
      }
    }

    this.#logger?.debug(
      'storage:cache',
      `Invalidated all caches for adapter: '${adapterName}' (${count} content entries)`,
    );
    // Note: Disk files for this adapter remain but will be orphaned
    // A full cleanup would require tracking or scanning the cache dir
  }

  /** Invalidate all caches */
  async invalidateAll(): Promise<void> {
    const listCount = this.#fileListCache.size;
    const contentCount = this.#contentMetaCache.size;

    this.#fileListCache.clear();
    this.#contentMetaCache.clear();

    // Clean entire cache directory
    try {
      const entries = await fs.readdir(this.#cacheDir);
      await Promise.all(
        entries.map((entry) => fs.unlink(path.join(this.#cacheDir, entry)).catch(() => {})),
      );
      this.#logger?.debug(
        'storage:cache',
        `Invalidated all caches (${listCount} file lists, ${contentCount} content entries, ${entries.length} disk files)`,
      );
    } catch {
      // Cache dir might not exist
      this.#logger?.debug(
        'storage:cache',
        `Invalidated all caches (${listCount} file lists, ${contentCount} content entries)`,
      );
    }
  }
}
