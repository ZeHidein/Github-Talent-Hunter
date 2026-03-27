import type { AbstractStorageAdapter } from './adapters/abstract-storage-adapter.ts';
import type { StorageLogger } from './storage-logger.ts';

// ============================================================================
// Named Adapter
// ============================================================================

/** A named adapter for use in AgentStorage */
export type NamedAdapter = {
  /** Unique name for this adapter (used for explicit read/write targeting) */
  name: string;
  /** The adapter instance */
  adapter: AbstractStorageAdapter;
};

// ============================================================================
// Configuration
// ============================================================================

export type AgentStorageParams = {
  /** Array of named adapters in resolution order (first = highest priority) */
  adapters: NamedAdapter[];

  /** Enable caching (default: true) */
  cacheEnabled?: boolean;

  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTtl?: number;

  /** Enable debug logging (default: false) */
  debugEnabled?: boolean;

  /** Optional namespace filter for debug logging (e.g., ['storage:read', 'storage:cache']) */
  debugNamespaces?: string[];

  /** Custom logger implementation (defaults to console) */
  logger?: StorageLogger;
};

// ============================================================================
// Read/Write Options & Results
// ============================================================================

export type StorageReadOptions = {
  /** Explicit adapter name to read from (skips chain resolution) */
  adapter?: string;
};

export type StorageWriteOptions = {
  /** Explicit adapter name to write to (default: first writable adapter) */
  adapter?: string;
  /** Enable zstd compression for this file (overrides adapter default) */
  compression?: boolean;
};

export type StorageWriteResult = {
  path: string;
  /** Name of the adapter that was written to */
  adapter: string;
};

// ============================================================================
// File Metadata
// ============================================================================

/** Metadata for a file from a specific adapter */
export type AdapterFileMetadata = {
  /** Adapter name */
  adapter: string;
  size: number;
  contentType: string;
  uploadedAt?: string;
  /** Whether the file is stored compressed */
  isCompressed?: boolean;
  /** Original size before compression (only set if isCompressed) */
  originalSize?: number;
};

export type StorageFileMetadata = {
  path: string;
  /** Primary adapter (first in resolution chain where file exists) */
  adapter: string;
  size: number;
  contentType: string;
  uploadedAt?: string;
  /** Whether the file is stored compressed */
  isCompressed?: boolean;
  /** Original size before compression (only set if isCompressed) */
  originalSize?: number;
  /** Additional adapters where this file also exists */
  additionalAdapters?: AdapterFileMetadata[];
};

/** Internal: raw file metadata from a single adapter */
export type RawFileMetadata = {
  path: string;
  size: number;
  contentType: string;
  uploadedAt?: string;
  /** Whether the file is stored compressed */
  isCompressed?: boolean;
  /** Original size before compression (only set if isCompressed) */
  originalSize?: number;
};

// ============================================================================
// Error Classes
// ============================================================================

/** Base error for all storage errors */
export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

/** File not found in any searched adapter */
export class StorageFileNotFoundError extends StorageError {
  path: string;
  searchedAdapters: string[];

  constructor(path: string, searchedAdapters: string[]) {
    const searched = searchedAdapters.length > 0 ? searchedAdapters.join(', ') : 'none';
    super(`File not found: "${path}" (searched adapters: ${searched})`);
    this.name = 'StorageFileNotFoundError';
    this.path = path;
    this.searchedAdapters = searchedAdapters;
  }
}

/** Requested adapter is not configured */
export class StorageAdapterNotFoundError extends StorageError {
  adapterName: string;

  constructor(adapterName: string) {
    super(`Storage adapter "${adapterName}" not found`);
    this.name = 'StorageAdapterNotFoundError';
    this.adapterName = adapterName;
  }
}

/** No writable adapter available */
export class StorageNoWritableAdapterError extends StorageError {
  constructor() {
    super('No writable adapter available');
    this.name = 'StorageNoWritableAdapterError';
  }
}

/** HTTP API error */
export class StorageApiError extends StorageError {
  statusCode: number;
  endpoint: string;

  constructor(statusCode: number, message: string, endpoint: string) {
    super(`API error ${statusCode}: ${message} (${endpoint})`);
    this.name = 'StorageApiError';
    this.statusCode = statusCode;
    this.endpoint = endpoint;
  }
}

/** Local filesystem error */
export class StorageLocalError extends StorageError {
  originalError: Error;

  constructor(message: string, originalError: Error) {
    super(message);
    this.name = 'StorageLocalError';
    this.originalError = originalError;
  }
}
