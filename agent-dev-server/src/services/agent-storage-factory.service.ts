import { AgentStorage } from '../../vendor/agent-library/storage/agent-storage';
import { AgentPlaceApiAdapter } from '../../vendor/agent-library/storage/adapters/agentplace-api.adapter';
import { LocalFileSystemAdapter } from '../../vendor/agent-library/storage/adapters/local-filesystem.adapter';
import type { AbstractStorageAdapter } from '../../vendor/agent-library/storage/adapters/abstract-storage-adapter';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type AgentStorageFactoryServiceParams = {
  /** API base URL (e.g., 'https://api.agentplace.io') */
  apiBaseUrl: string;
  /** Model access token for authentication */
  modelAccessToken: string;
};

/**
 * Factory service for creating AgentStorage instances with proper configuration.
 *
 * This service creates AgentStorage instances configured with AgentPlaceApiAdapter(s):
 * - One adapter for common storage (shared across sessions)
 * - Optionally another adapter for secret/private storage (session-specific)
 *
 * The AgentStorage instance includes built-in caching for performance optimization.
 */
export class AgentStorageFactoryService {
  #apiBaseUrl: string;
  #modelAccessToken: string;
  #storageCache: Map<string, AgentStorage>;

  constructor(params: AgentStorageFactoryServiceParams) {
    this.#apiBaseUrl = params.apiBaseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.#modelAccessToken = params.modelAccessToken;
    this.#storageCache = new Map();
  }

  /**
   * Create a new AgentStorage instance with configured adapters.
   *
   * @param secretFolder - Optional secret folder for private storage isolation.
   *                       If provided, creates two adapters (private + common).
   *                       If not provided, creates one adapter (common only).
   * @param options - Additional configuration options
   * @returns Configured AgentStorage instance with caching enabled
   */
  createStorage(
    secretFolder?: string,
    options?: {
      /** Enable debug logging (default: false) */
      debugEnabled?: boolean;
      /** Cache TTL in milliseconds (default: 5 minutes) */
      cacheTtl?: number;
      /** Enable compression for uploads/downloads (default: false) */
      compression?: boolean;
    },
  ): AgentStorage {
    const { debugEnabled = false, cacheTtl, compression = false } = options ?? {};

    const adapters: Array<{
      name: string;
      adapter: AbstractStorageAdapter;
    }> = [];

    // If secretFolder is provided, create private adapter first (higher priority)
    if (secretFolder) {
      adapters.push({
        name: 'private',
        adapter: new AgentPlaceApiAdapter({
          apiBaseUrl: this.#apiBaseUrl,
          accessKey: this.#modelAccessToken,
          secretFolder,
          compression,
        }),
      });
    }

    // Always create common adapter
    adapters.push({
      name: 'common',
      adapter: new AgentPlaceApiAdapter({
        apiBaseUrl: this.#apiBaseUrl,
        accessKey: this.#modelAccessToken,
        compression,
      }),
    });

    const agentPath = path.join(__dirname, '..', '..', '.agent');

    adapters.push({
      name: 'local',
      adapter: new LocalFileSystemAdapter({
        basePath: agentPath,
      }),
    });

    return new AgentStorage({
      adapters,
      cacheEnabled: true, // Always enable cache for performance
      cacheTtl,
      debugEnabled,
    });
  }

  /**
   * Get or create an AgentStorage instance with caching.
   * Returns existing instance from cache if available, otherwise creates a new one.
   *
   * @param secretFolder - Optional secret folder for private storage isolation.
   * @param options - Additional configuration options
   * @returns Cached or newly created AgentStorage instance
   */
  getStorage(secretFolder?: string): AgentStorage {
    // Create cache key based on secretFolder
    const cacheKey = secretFolder || '__common__';

    // Check if instance already exists in cache
    if (this.#storageCache.has(cacheKey)) {
      return this.#storageCache.get(cacheKey);
    }

    // Create new instance
    const storage = this.createStorage(secretFolder);

    // Cache it
    this.#storageCache.set(cacheKey, storage);

    return storage;
  }

  /**
   * Clear the storage cache. Useful for testing or when you need to force recreation.
   */
  clearCache(): void {
    this.#storageCache.clear();
  }

  /**
   * Get the configured API base URL
   */
  getApiBaseUrl(): string {
    return this.#apiBaseUrl;
  }

  /**
   * Get the model access token used for API authentication
   */
  getAccessKey(): string {
    return this.#modelAccessToken;
  }
}

export default AgentStorageFactoryService;
