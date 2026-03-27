import {
  type AgentStorageParams,
  type NamedAdapter,
  type StorageReadOptions,
  type StorageWriteOptions,
  type StorageWriteResult,
  type StorageFileMetadata,
  type AdapterFileMetadata,
  type RawFileMetadata,
  StorageFileNotFoundError,
  StorageAdapterNotFoundError,
  StorageNoWritableAdapterError,
} from './types.ts';
import { StorageCache } from './storage-cache.ts';
import { getMimeType } from './mime-utils.ts';
import { DebugLogger } from './storage-logger.ts';

export class AgentStorage {
  #adapters: NamedAdapter[];
  #cache: StorageCache | null;
  #logger: DebugLogger;

  constructor(params: AgentStorageParams) {
    if (!params.adapters || params.adapters.length === 0) {
      throw new Error('AgentStorage requires at least one adapter');
    }

    this.#logger = new DebugLogger({
      enabled: params.debugEnabled ?? false,
      namespaces: params.debugNamespaces,
      logger: params.logger,
    });

    // Pass logger to adapters with their names
    this.#adapters = params.adapters.map((namedAdapter) => {
      // Set logger on adapter with adapter name for better log identification
      namedAdapter.adapter.setLogger(this.#logger, namedAdapter.name);
      return namedAdapter;
    });

    this.#cache =
      params.cacheEnabled !== false
        ? new StorageCache({ ttl: params.cacheTtl, logger: this.#logger })
        : null;
  }

  // ============================================================================
  // Adapter Lookup
  // ============================================================================

  /** Find adapter by name */
  #findAdapter(name: string): NamedAdapter | undefined {
    return this.#adapters.find((a) => a.name === name);
  }

  /** Find first writable adapter */
  #findFirstWritableAdapter(): NamedAdapter | undefined {
    return this.#adapters.find((a) => a.adapter.writable);
  }

  /** Get adapter by name, throw if not found */
  #getAdapter(name: string): NamedAdapter {
    const adapter = this.#findAdapter(name);
    if (!adapter) {
      throw new StorageAdapterNotFoundError(name);
    }
    return adapter;
  }

  // ============================================================================
  // List-Based Resolution
  // ============================================================================

  /**
   * Find which adapter has a file using cached file lists.
   * Returns adapters in priority order that have this file in their cached list.
   */
  #findAdaptersInCachedList(filePath: string): NamedAdapter[] {
    if (!this.#cache) {
      return [];
    }

    const result: NamedAdapter[] = [];

    for (const namedAdapter of this.#adapters) {
      const { name, adapter } = namedAdapter;

      // Only check adapters with cacheable lists
      if (!adapter.cacheableList) {
        continue;
      }

      const cachedList = this.#cache.getFileList(name);
      if (!cachedList) {
        continue;
      }

      // Check if file exists in cached list
      if (cachedList.some((f) => f.path === filePath)) {
        result.push(namedAdapter);
      }
    }

    return result;
  }

  // ============================================================================
  // readFile
  // ============================================================================

  /**
   * Read file following the resolution chain.
   * Uses cached file lists to optimize adapter selection when available.
   *
   * @param filePath - File path to read
   * @param options - Read options (optional adapter override)
   * @returns File content as Buffer
   * @throws StorageFileNotFoundError if file not found
   * @throws StorageAdapterNotFoundError if requested adapter not found
   */
  async readFile(filePath: string, options?: StorageReadOptions): Promise<Buffer> {
    const startTime = Date.now();
    const { adapter: adapterName } = options ?? {};

    this.#logger.debug('storage:read', `readFile('${filePath}') - starting resolution`, {
      explicitAdapter: adapterName,
    });

    // Explicit adapter requested
    if (adapterName) {
      this.#logger.debug('storage:read', `Using explicit adapter: ${adapterName}`);
      const namedAdapter = this.#getAdapter(adapterName);
      const content = await this.#readFromAdapter(filePath, namedAdapter);
      const duration = Date.now() - startTime;
      this.#logger.debug(
        'storage:read',
        `readFile('${filePath}') - completed in ${duration}ms (explicit adapter)`,
      );
      return content;
    }

    // Build a set of adapter names that have the file in cached lists (for optimization)
    const cachedAdapters = this.#findAdaptersInCachedList(filePath);
    const cachedAdapterNames = new Set(cachedAdapters.map((a) => a.name));

    if (cachedAdapterNames.size > 0) {
      this.#logger.debug(
        'storage:read',
        `File found in ${cachedAdapterNames.size} cached list(s):`,
        Array.from(cachedAdapterNames),
      );
    }

    // Try each adapter in priority order
    // For adapters with cached lists: skip if file not in cache (optimization)
    // For adapters without cached lists or with invalidated cache: always try
    const searchedAdapters: string[] = [];

    this.#logger.debug(
      'storage:read',
      `Searching adapters in priority order: ${this.#adapters.map((a) => a.name).join(', ')}`,
    );

    for (const namedAdapter of this.#adapters) {
      const { name, adapter } = namedAdapter;

      // Optimization: if this adapter has a cached list and file is NOT in it, skip
      // BUT: only skip if cache has items (non-empty list means cache is valid)
      if (adapter.cacheableList && this.#cache) {
        const cachedList = this.#cache.getFileList(name);
        if (cachedList && cachedList.length > 0 && !cachedList.some((f) => f.path === filePath)) {
          this.#logger.debug(
            'storage:read',
            `Skipping '${name}': file not in cached list (${cachedList.length} files cached)`,
          );
          searchedAdapters.push(name);
          continue;
        }
        if (cachedList && cachedList.length === 0) {
          this.#logger.debug(
            'storage:read',
            `Trying '${name}' despite empty cached list (cache might be stale)`,
          );
        }
      }

      searchedAdapters.push(name);
      this.#logger.debug('storage:read', `Trying adapter: ${name}`);
      const content = await this.#tryReadFromAdapter(filePath, namedAdapter);
      if (content !== null) {
        const duration = Date.now() - startTime;
        this.#logger.debug(
          'storage:read',
          `readFile('${filePath}') - completed in ${duration}ms (adapter: ${name})`,
        );
        return content;
      }
    }

    this.#logger.error('storage:read', `readFile('${filePath}') - not found in any adapter`, {
      searchedAdapters,
    });
    throw new StorageFileNotFoundError(filePath, searchedAdapters);
  }

  /** Read from specific adapter, throw if not found */
  async #readFromAdapter(filePath: string, namedAdapter: NamedAdapter): Promise<Buffer> {
    const content = await this.#tryReadFromAdapter(filePath, namedAdapter);
    if (content === null) {
      throw new StorageFileNotFoundError(filePath, [namedAdapter.name]);
    }
    return content;
  }

  /** Try to read from adapter, return null if not found */
  async #tryReadFromAdapter(filePath: string, namedAdapter: NamedAdapter): Promise<Buffer | null> {
    const { name, adapter } = namedAdapter;

    // Check cache first (if adapter is cacheable for content)
    if (adapter.cacheableContent) {
      const cached = await this.#cache?.getFileContent(filePath, name);
      if (cached) {
        this.#logger.debug(
          'storage:cache',
          `Cache hit for content: '${filePath}' @ '${name}' (${cached.length} bytes)`,
        );
        return cached;
      }
      this.#logger.debug('storage:cache', `Cache miss for content: '${filePath}' @ '${name}'`);
    }

    const content = await adapter.readFile(filePath);

    if (content !== null) {
      this.#logger.debug(
        'storage:adapter',
        `Read successful from '${name}': '${filePath}' (${content.length} bytes)`,
      );

      // Cache successful reads (if adapter is cacheable for content)
      if (adapter.cacheableContent) {
        await this.#cache?.setFileContent(filePath, name, content);
        this.#logger.debug(
          'storage:cache',
          `Cached content: '${filePath}' @ '${name}' (${content.length} bytes)`,
        );
      }
    } else {
      this.#logger.debug('storage:adapter', `Read failed from '${name}': '${filePath}' not found`);
    }

    return content;
  }

  // ============================================================================
  // writeFile
  // ============================================================================

  /**
   * Write file to an adapter.
   * @param filePath - File path to write
   * @param content - File content as Buffer
   * @param options - Write options (optional adapter override)
   * @returns Write result
   * @throws StorageAdapterNotFoundError if requested adapter not found
   * @throws StorageNoWritableAdapterError if no writable adapter available
   */
  async writeFile(
    filePath: string,
    content: Buffer,
    options?: StorageWriteOptions,
  ): Promise<StorageWriteResult> {
    const { adapter: adapterName, compression } = options ?? {};

    this.#logger.debug('storage:write', `writeFile('${filePath}', ${content.length} bytes)`, {
      explicitAdapter: adapterName,
      compression,
    });

    let targetAdapter: NamedAdapter;

    if (adapterName) {
      targetAdapter = this.#getAdapter(adapterName);
      if (!targetAdapter.adapter.writable) {
        throw new Error(`Adapter "${adapterName}" is not writable`);
      }
    } else {
      const writable = this.#findFirstWritableAdapter();
      if (!writable) {
        throw new StorageNoWritableAdapterError();
      }
      targetAdapter = writable;
    }

    this.#logger.debug('storage:write', `Writing to adapter: ${targetAdapter.name}`);

    // Detect content type from file extension
    const contentType = getMimeType(filePath);

    // Write to adapter with options
    await targetAdapter.adapter.writeFile(filePath, content, contentType, { compression });

    this.#logger.info(
      'storage:write',
      `Write successful: '${filePath}' @ '${targetAdapter.name}' (${content.length} bytes, ${contentType})`,
    );

    // Invalidate cache
    if (targetAdapter.adapter.cacheableList) {
      this.#cache?.invalidateFileList(targetAdapter.name);
      this.#logger.debug(
        'storage:cache',
        `Invalidated file list cache for '${targetAdapter.name}'`,
      );
    }
    if (targetAdapter.adapter.cacheableContent) {
      await this.#cache?.invalidateFileContent(filePath, targetAdapter.name);
      this.#logger.debug(
        'storage:cache',
        `Invalidated content cache: '${filePath}' @ '${targetAdapter.name}'`,
      );
    }

    return {
      path: filePath,
      adapter: targetAdapter.name,
    };
  }

  // ============================================================================
  // listFiles
  // ============================================================================

  /**
   * List files from specified adapter(s).
   * @param adapterNames - Array of adapter names to query (default: all adapters)
   * @returns Merged file list with primary adapter and additionalAdapters
   */
  async listFiles(adapterNames?: string[]): Promise<StorageFileMetadata[]> {
    const startTime = Date.now();

    // Determine which adapters to query
    let targetAdapters: NamedAdapter[];

    if (adapterNames && adapterNames.length > 0) {
      targetAdapters = adapterNames.map((name) => this.#getAdapter(name));
      this.#logger.debug(
        'storage:list',
        `listFiles() - querying specific adapters: ${adapterNames.join(', ')}`,
      );
    } else {
      targetAdapters = this.#adapters;
      this.#logger.debug(
        'storage:list',
        `listFiles() - querying all adapters: ${this.#adapters.map((a) => a.name).join(', ')}`,
      );
    }

    // Fetch file lists from all target adapters (in parallel)
    const listPromises = targetAdapters.map(async (namedAdapter) => {
      const files = await this.#listFromAdapter(namedAdapter);
      return { name: namedAdapter.name, files };
    });

    const results = await Promise.all(listPromises);

    // Merge files with priority handling
    const merged = this.#mergeFileLists(results);

    const duration = Date.now() - startTime;
    this.#logger.debug(
      'storage:list',
      `listFiles() - completed in ${duration}ms (${merged.length} unique files)`,
    );

    return merged;
  }

  /** List files from a specific adapter (with caching) */
  async #listFromAdapter(namedAdapter: NamedAdapter): Promise<RawFileMetadata[]> {
    const { name, adapter } = namedAdapter;

    // Check cache first (if adapter is cacheable for list)
    if (adapter.cacheableList) {
      const cached = this.#cache?.getFileList(name);
      if (cached) {
        this.#logger.debug(
          'storage:cache',
          `Cache hit for file list: '${name}' (${cached.length} files)`,
        );
        return cached;
      }
      this.#logger.debug('storage:cache', `Cache miss for file list: '${name}'`);
    }

    const files = await adapter.listFiles();

    this.#logger.debug('storage:adapter', `Listed ${files.length} files from '${name}'`);

    // Cache the result (if adapter is cacheable for list)
    if (adapter.cacheableList) {
      this.#cache?.setFileList(name, files);
      this.#logger.debug('storage:cache', `Cached file list: '${name}' (${files.length} files)`);
    }

    return files;
  }

  /** Merge file lists from multiple adapters */
  #mergeFileLists(
    results: Array<{ name: string; files: RawFileMetadata[] }>,
  ): StorageFileMetadata[] {
    // Group files by path
    const fileMap = new Map<string, Map<string, RawFileMetadata>>();

    for (const { name, files } of results) {
      for (const file of files) {
        if (!fileMap.has(file.path)) {
          fileMap.set(file.path, new Map());
        }
        fileMap.get(file.path)!.set(name, file);
      }
    }

    // Build merged result (respect adapter order for priority)
    const adapterOrder = results.map((r) => r.name);
    const merged: StorageFileMetadata[] = [];

    for (const [filePath, adapterMap] of fileMap) {
      // Find primary adapter (first in order that has this file)
      let primaryAdapterName: string | null = null;
      for (const name of adapterOrder) {
        if (adapterMap.has(name)) {
          primaryAdapterName = name;
          break;
        }
      }

      if (!primaryAdapterName) {
        continue;
      }

      const primaryFile = adapterMap.get(primaryAdapterName)!;

      // Build additional adapters (all except primary)
      const additionalAdapters: AdapterFileMetadata[] = [];
      for (const [adapterName, file] of adapterMap) {
        if (adapterName !== primaryAdapterName) {
          additionalAdapters.push({
            adapter: adapterName,
            size: file.size,
            contentType: file.contentType,
            uploadedAt: file.uploadedAt,
            isCompressed: file.isCompressed,
            originalSize: file.originalSize,
          });
        }
      }

      merged.push({
        path: filePath,
        adapter: primaryAdapterName,
        size: primaryFile.size,
        contentType: primaryFile.contentType,
        uploadedAt: primaryFile.uploadedAt,
        isCompressed: primaryFile.isCompressed,
        originalSize: primaryFile.originalSize,
        additionalAdapters: additionalAdapters.length > 0 ? additionalAdapters : undefined,
      });
    }

    // Sort by path for consistent output
    merged.sort((a, b) => a.path.localeCompare(b.path));

    return merged;
  }

  // ============================================================================
  // exists
  // ============================================================================

  /**
   * Check if file exists following the resolution chain.
   * @param filePath - File path to check
   * @param options - Read options (optional adapter override)
   * @returns true if file exists, false otherwise
   */
  async exists(filePath: string, options?: StorageReadOptions): Promise<boolean> {
    const { adapter: adapterName } = options ?? {};

    // Explicit adapter requested
    if (adapterName) {
      const namedAdapter = this.#getAdapter(adapterName);
      return this.#existsInAdapter(filePath, namedAdapter);
    }

    // Resolution chain: check each adapter
    for (const namedAdapter of this.#adapters) {
      if (await this.#existsInAdapter(filePath, namedAdapter)) {
        return true;
      }
    }

    return false;
  }

  /** Check if file exists in a specific adapter */
  async #existsInAdapter(filePath: string, namedAdapter: NamedAdapter): Promise<boolean> {
    const { name, adapter } = namedAdapter;

    // Check cache first - if we have content cached, file exists
    if (adapter.cacheableContent) {
      const cached = await this.#cache?.getFileContent(filePath, name);
      if (cached) {
        return true;
      }
    }

    return adapter.exists(filePath);
  }

  // ============================================================================
  // deleteFile
  // ============================================================================

  /**
   * Delete file from an adapter.
   * @param filePath - File path to delete
   * @param options - Write options (optional adapter override)
   * @throws StorageFileNotFoundError if file not found
   * @throws StorageAdapterNotFoundError if requested adapter not found
   * @throws StorageNoWritableAdapterError if no writable adapter available
   */
  async deleteFile(filePath: string, options?: StorageWriteOptions): Promise<void> {
    const { adapter: adapterName } = options ?? {};

    this.#logger.debug('storage:delete', `deleteFile('${filePath}')`, {
      explicitAdapter: adapterName,
    });

    let targetAdapter: NamedAdapter;

    if (adapterName) {
      targetAdapter = this.#getAdapter(adapterName);
      if (!targetAdapter.adapter.writable) {
        throw new Error(`Adapter "${adapterName}" is not writable`);
      }
    } else {
      const writable = this.#findFirstWritableAdapter();
      if (!writable) {
        throw new StorageNoWritableAdapterError();
      }
      targetAdapter = writable;
    }

    this.#logger.debug('storage:delete', `Deleting from adapter: ${targetAdapter.name}`);

    await targetAdapter.adapter.deleteFile(filePath);

    this.#logger.info(
      'storage:delete',
      `Delete successful: '${filePath}' @ '${targetAdapter.name}'`,
    );

    // Invalidate cache
    if (targetAdapter.adapter.cacheableList) {
      this.#cache?.invalidateFileList(targetAdapter.name);
      this.#logger.debug(
        'storage:cache',
        `Invalidated file list cache for '${targetAdapter.name}'`,
      );
    }
    if (targetAdapter.adapter.cacheableContent) {
      await this.#cache?.invalidateFileContent(filePath, targetAdapter.name);
      this.#logger.debug(
        'storage:cache',
        `Invalidated content cache: '${filePath}' @ '${targetAdapter.name}'`,
      );
    }
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  /**
   * Clear all cached data.
   */
  async invalidateCache(): Promise<void> {
    await this.#cache?.invalidateAll();
  }

  /**
   * Clear cached data for a specific adapter.
   */
  async invalidateAdapterCache(adapterName: string): Promise<void> {
    this.#getAdapter(adapterName); // Validate adapter exists
    await this.#cache?.invalidateAdapter(adapterName);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /** Get list of configured adapter names */
  getAdapterNames(): string[] {
    return this.#adapters.map((a) => a.name);
  }

  /** Check if an adapter is configured */
  hasAdapter(name: string): boolean {
    return this.#adapters.some((a) => a.name === name);
  }
}
