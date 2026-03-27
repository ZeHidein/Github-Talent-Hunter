# AgentStorage - Adapter-Based Storage System

A flexible, adapter-based storage system for agent-library that allows composing multiple storage backends with customizable resolution order.

## Overview

AgentStorage uses the **adapter pattern** where:
- **Adapters** are independent storage implementations (API, local filesystem, in-memory)
- **Resolution order** follows adapter array order (first adapter wins on read)
- **Caching** is centralized and respects per-adapter cache settings
- **Testing** is easy with `InMemoryAdapter`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      AgentStorage                           │
│                       (Facade)                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐    │
│  │  Adapter 1  │  │  Adapter 2  │  │   Adapter 3      │    │
│  │  (private)  │  │  (common)   │  │   (local)        │    │
│  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘    │
│         │                │                   │              │
│         └────────────────┼───────────────────┘              │
│                          │                                  │
│                    ┌─────┴─────┐                            │
│                    │   Cache   │                            │
│                    └───────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

## Installation

```typescript
import { 
  AgentStorage,
  AgentPlaceApiAdapter,
  LocalFileSystemAdapter,
  InMemoryAdapter,
} from '@agentplace/agent';
```

## Quick Start

### Basic Setup

```typescript
const storage = new AgentStorage({
  adapters: [
    { name: 'api', adapter: new AgentPlaceApiAdapter({ 
      apiBaseUrl: 'https://api.agentplace.io',
      accessKey: 'your-access-key',
    })},
  ],
});

const file = await storage.readFile('config.json');
```

### Multi-Adapter Setup (Private → Common → Local)

```typescript
const storage = new AgentStorage({
  adapters: [
    // First: private storage (user-specific)
    { name: 'private', adapter: new AgentPlaceApiAdapter({ 
      apiBaseUrl: 'https://api.agentplace.io',
      accessKey: 'access-key',
      secretFolder: 'user-session-12345',
    })},
    // Second: common storage (shared)
    { name: 'common', adapter: new AgentPlaceApiAdapter({ 
      apiBaseUrl: 'https://api.agentplace.io',
      accessKey: 'access-key',
    })},
    // Third: local fallback (readonly)
    { name: 'local', adapter: new LocalFileSystemAdapter({ 
      basePath: '/app/static-files',
    })},
  ],
});

// Reads: private → common → local (first found wins)
const config = await storage.readFile('config.json');
```

### For Testing

```typescript
const mockAdapter = new InMemoryAdapter({
  'config.json': Buffer.from('{"key": "value"}'),
  'data.txt': Buffer.from('Hello, World!'),
});

const storage = new AgentStorage({
  adapters: [{ name: 'mock', adapter: mockAdapter }],
});

// Easy to test without network or filesystem
const file = await storage.readFile('config.json');
```

## Built-in Adapters

### AgentPlaceApiAdapter

Remote HTTP storage via AgentPlace API.

```typescript
new AgentPlaceApiAdapter({
  apiBaseUrl: string;      // Required: API base URL
  accessKey: string;       // Required: Authentication key
  secretFolder?: string;   // Optional: Private storage isolation
  compression?: boolean;   // Optional: Enable zstd compression (default: false)
})
```

**Properties:**
- `writable: true`
- `cacheableList: true` (network calls are expensive)
- `cacheableContent: true` (network calls are expensive)

**Compression:**

When `compression: true`, files are automatically compressed using zstd before upload and decompressed after download. This is especially useful for large JSON files:

```typescript
const adapter = new AgentPlaceApiAdapter({
  apiBaseUrl: 'https://api.agentplace.io',
  accessKey: 'your-key',
  compression: true,  // Enable compression
});

// 20MB JSON → compressed to ~2MB over network → stored as data.json.zst
await storage.writeFile('data.json', largeJsonBuffer);

// Downloads ~2MB → decompressed → returns original 20MB
const data = await storage.readFile('data.json');
```

See [Compression](#compression) section for details.

### LocalFileSystemAdapter

Local filesystem storage (readonly).

```typescript
new LocalFileSystemAdapter({
  basePath: string;  // Required: Root directory path
})
```

**Properties:**
- `writable: false`
- `cacheableList: true` (directory scanning is expensive)
- `cacheableContent: false` (local file reads are fast)

### InMemoryAdapter

In-memory storage for testing.

```typescript
new InMemoryAdapter(initialFiles?: Record<string, Buffer>)
```

**Properties:**
- `writable: true`
- `cacheableList: false` (already in memory)
- `cacheableContent: false` (already in memory)

**Test helpers:**
```typescript
const adapter = new InMemoryAdapter();
adapter.setFile('test.txt', 'content');
adapter.clear();
console.log(adapter.fileCount);
```

## API Reference

### `readFile(path, options?)`

Reads a file following the resolution chain.

```typescript
readFile(path: string, options?: StorageReadOptions): Promise<Buffer>

type StorageReadOptions = {
  /** Explicit adapter name to read from (skips chain resolution) */
  adapter?: string;
};
```

**Examples:**
```typescript
// Default: follows adapter chain
const file = await storage.readFile('data.json');

// Explicit: read only from specific adapter
const privateFile = await storage.readFile('secret.json', { adapter: 'private' });
const localTemplate = await storage.readFile('template.html', { adapter: 'local' });
```

---

### `writeFile(path, content, options?)`

Writes a file to an adapter.

```typescript
writeFile(
  path: string, 
  content: Buffer, 
  options?: StorageWriteOptions
): Promise<StorageWriteResult>

type StorageWriteOptions = {
  /** Explicit adapter name to write to (default: first writable adapter) */
  adapter?: string;
  /** Enable zstd compression for this file (overrides adapter default) */
  compression?: boolean;
};

type StorageWriteResult = {
  path: string;
  adapter: string;
};
```

**Examples:**
```typescript
// Write to first writable adapter
await storage.writeFile('report.json', Buffer.from('{}'));

// Write to specific adapter
await storage.writeFile('user-settings.json', settings, { adapter: 'private' });

// Write with compression
await storage.writeFile('large-data.json', bigJson, { compression: true });
```

---

### `listFiles(adapterNames?)`

Lists files from specified adapter(s).

```typescript
listFiles(adapterNames?: string[]): Promise<StorageFileMetadata[]>

type StorageFileMetadata = {
  path: string;
  adapter: string;           // Primary adapter
  size: number;
  contentType: string;
  uploadedAt?: string;
  additionalAdapters?: AdapterFileMetadata[];
};
```

**Examples:**
```typescript
// List from all adapters
const allFiles = await storage.listFiles();

// List from specific adapters
const remoteFiles = await storage.listFiles(['private', 'common']);
```

---

### `exists(path, options?)`

Checks if a file exists.

```typescript
exists(path: string, options?: StorageReadOptions): Promise<boolean>
```

---

### `deleteFile(path, options?)`

Deletes a file from an adapter.

```typescript
deleteFile(path: string, options?: StorageWriteOptions): Promise<void>
```

---

### `invalidateCache()`

Clears all cached data.

```typescript
await storage.invalidateCache();
```

---

### `invalidateAdapterCache(adapterName)`

Clears cached data for a specific adapter.

```typescript
await storage.invalidateAdapterCache('common');
```

---

### `getAdapterNames()`

Returns list of configured adapter names.

```typescript
storage.getAdapterNames(); // ['private', 'common', 'local']
```

---

### `hasAdapter(name)`

Checks if an adapter is configured.

```typescript
storage.hasAdapter('private'); // true
```

## Creating Custom Adapters

Extend `AbstractStorageAdapter`:

```typescript
import { AbstractStorageAdapter, RawFileMetadata } from '@agentplace/agent';

export class S3Adapter extends AbstractStorageAdapter {
  #bucket: string;
  #client: S3Client;

  constructor(params: { bucket: string; region: string }) {
    super();
    this.#bucket = params.bucket;
    this.#client = new S3Client({ region: params.region });
  }

  get writable(): boolean { return true; }
  get cacheableList(): boolean { return true; }
  get cacheableContent(): boolean { return true; }

  async readFile(path: string): Promise<Buffer | null> {
    try {
      const response = await this.#client.send(new GetObjectCommand({
        Bucket: this.#bucket,
        Key: path,
      }));
      return Buffer.from(await response.Body!.transformToByteArray());
    } catch (err) {
      if (err.name === 'NoSuchKey') return null;
      throw err;
    }
  }

  async writeFile(path: string, content: Buffer, contentType: string): Promise<void> {
    await this.#client.send(new PutObjectCommand({
      Bucket: this.#bucket,
      Key: path,
      Body: content,
      ContentType: contentType,
    }));
  }

  async deleteFile(path: string): Promise<void> {
    await this.#client.send(new DeleteObjectCommand({
      Bucket: this.#bucket,
      Key: path,
    }));
  }

  async listFiles(): Promise<RawFileMetadata[]> {
    // Implementation...
  }

  async exists(path: string): Promise<boolean> {
    const content = await this.readFile(path);
    return content !== null;
  }
}
```

## Caching Behavior

Cache is centralized in `AgentStorage` and respects adapter settings:

| Adapter | cacheableList | cacheableContent | Why |
|---------|---------------|------------------|-----|
| AgentPlaceApiAdapter | `true` | `true` | Network calls are expensive |
| LocalFileSystemAdapter | `true` | `false` | Dir scan slow, file read fast |
| InMemoryAdapter | `false` | `false` | Already instant |

**Cache key format:** `${adapterName}:${filePath}`

**Cache storage:**
- File lists: in-memory
- File content: disk-based (temp directory)

## Compression

The `AgentPlaceApiAdapter` supports transparent zstd compression for reducing network transfer and storage size.

### Enable Compression

**Adapter-level (default for all files):**

```typescript
const adapter = new AgentPlaceApiAdapter({
  apiBaseUrl: 'https://api.agentplace.io',
  accessKey: 'your-key',
  compression: true,  // Default: compress all files
});

const storage = new AgentStorage({
  adapters: [{ name: 'api', adapter }],
});

// All writes use compression by default
await storage.writeFile('data.json', largeJson);
```

**Per-file (override adapter default):**

```typescript
// Uses adapter default (compressed if compression: true)
await storage.writeFile('data.json', largeJson);

// Override: explicitly compress this file
await storage.writeFile('large-export.csv', csvBuffer, { compression: true });

// Override: explicitly disable compression for this file
await storage.writeFile('small-config.json', configBuffer, { compression: false });
```

### How It Works

**Upload:**
1. Client compresses file content with zstd
2. Sends compressed data with `X-File-Compression: zstd` header
3. Server stores as `filename.zst` in S3, metadata records original filename

**Download:**
1. Server returns compressed stream with `Content-Encoding: zstd` header
2. Client auto-decompresses and returns original content

### Compression Ratios (Typical)

| File Type | Original | Compressed | Ratio |
|-----------|----------|------------|-------|
| JSON (20MB) | 20 MB | 1-3 MB | 85-95% |
| CSV data | 10 MB | 1-2 MB | 80-90% |
| Text logs | 5 MB | 0.5-1 MB | 80-90% |
| Binary (already compressed) | 1 MB | ~1 MB | 0-5% |

### Implementation Notes

- Uses Node.js native `zlib.zstdCompress()` / `zstdDecompress()` (Node.js 22+)
- Upload uses custom `X-File-Compression` header (not `Content-Encoding`) to avoid proxy interference
- Download uses standard `Content-Encoding: zstd` header
- Compression is transparent: `readFile('data.json')` returns decompressed content
- File listing shows logical filename (`data.json`), with `isCompressed: true` in metadata

### When to Use

✅ **Recommended for:**
- Large JSON/CSV files (10MB+)
- Text-heavy content
- High-volume agent storage
- Network-constrained environments

❌ **Skip for:**
- Small files (<100KB, overhead may exceed savings)
- Already-compressed formats (images, videos, archives)

## Error Handling

```typescript
import { 
  StorageError,
  StorageFileNotFoundError,
  StorageAdapterNotFoundError,
  StorageNoWritableAdapterError,
  StorageApiError,
  StorageLocalError,
} from '@agentplace/agent';

try {
  const file = await storage.readFile('missing.json');
} catch (error) {
  if (error instanceof StorageFileNotFoundError) {
    console.log('File not found:', error.path);
    console.log('Searched adapters:', error.searchedAdapters);
  } else if (error instanceof StorageAdapterNotFoundError) {
    console.log('Adapter not found:', error.adapterName);
  } else if (error instanceof StorageApiError) {
    console.log('API error:', error.statusCode, error.message);
  }
}
```

## Use Cases

### 1. User Customization Over Defaults

```typescript
const storage = new AgentStorage({
  adapters: [
    { name: 'user', adapter: new AgentPlaceApiAdapter({ 
      apiBaseUrl, accessKey, secretFolder: userId 
    })},
    { name: 'defaults', adapter: new LocalFileSystemAdapter({ 
      basePath: '/app/defaults' 
    })},
  ],
});

// Returns user's custom template if exists, otherwise built-in
const template = await storage.readFile('email-template.html');
```

### 2. Testing Without Network

```typescript
describe('MyAgent', () => {
  it('should read config', async () => {
    const mockStorage = new InMemoryAdapter();
    mockStorage.setFile('config.json', '{"debug": true}');

    const storage = new AgentStorage({
      adapters: [{ name: 'test', adapter: mockStorage }],
      cacheEnabled: false,
    });

    const config = await storage.readFile('config.json');
    expect(config.toString()).toBe('{"debug": true}');
  });
});
```

### 3. Multi-Tenant Storage

```typescript
function createUserStorage(userId: string) {
  return new AgentStorage({
    adapters: [
      { name: 'private', adapter: new AgentPlaceApiAdapter({ 
        apiBaseUrl, accessKey, secretFolder: userId 
      })},
      { name: 'shared', adapter: new AgentPlaceApiAdapter({ 
        apiBaseUrl, accessKey 
      })},
    ],
  });
}
```

## Debug Logging

AgentStorage includes optional debug logging to help troubleshoot and understand storage operations.

### Enable Debug Logging

```typescript
const storage = new AgentStorage({
  adapters: [
    { name: 'api', adapter: new AgentPlaceApiAdapter({ ... }) },
  ],
  debugEnabled: true,  // Enable debug logging
});
```

### Filter by Namespace

Log only specific operation types:

```typescript
const storage = new AgentStorage({
  adapters: [...],
  debugEnabled: true,
  debugNamespaces: [
    'storage:read',   // File read operations
    'storage:cache',  // Cache hits/misses
  ],
});
```

**Available Namespaces:**

| Namespace | What It Logs |
|-----------|-------------|
| `storage:read` | File read operations and resolution chain |
| `storage:write` | File write operations |
| `storage:delete` | File delete operations |
| `storage:list` | File list operations |
| `storage:cache` | Cache hits, misses, TTL checks, invalidation |
| `storage:adapter` | Adapter-level operations (actual reads/writes) |

### Custom Logger

Integrate with your logging infrastructure:

```typescript
import type { StorageLogger } from '@agentplace/agent';

class CustomLogger implements StorageLogger {
  debug(namespace: string, message: string, ...args: unknown[]): void {
    myLogService.debug({ namespace, message, data: args });
  }
  
  info(namespace: string, message: string, ...args: unknown[]): void {
    myLogService.info({ namespace, message, data: args });
  }
  
  warn(namespace: string, message: string, ...args: unknown[]): void {
    myLogService.warn({ namespace, message, data: args });
  }
  
  error(namespace: string, message: string, ...args: unknown[]): void {
    myLogService.error({ namespace, message, data: args });
  }
}

const storage = new AgentStorage({
  adapters: [...],
  debugEnabled: true,
  logger: new CustomLogger(),
});
```

### Example Log Output

```typescript
await storage.writeFile('data.json', buffer);
await storage.readFile('data.json');
await storage.readFile('data.json'); // Second read (cache hit)
```

**Console output:**

```
[storage:write] writeFile('data.json', 1024 bytes) { adapter: undefined, compression: false }
[storage:write] Writing to adapter: api
[storage:write] Write successful: 'data.json' @ 'api' (1024 bytes, application/json)
[storage:cache] Invalidated file list cache for 'api'

[storage:read] readFile('data.json') - starting resolution
[storage:read] Searching adapters in priority order: api
[storage:read] Trying adapter: api
[storage:cache] Cache miss for content: 'data.json' @ 'api'
[storage:adapter] Read successful from 'api': 'data.json' (1024 bytes)
[storage:cache] Cached content: 'data.json' @ 'api' (1024 bytes)
[storage:read] readFile('data.json') - completed in 45ms (adapter: api)

[storage:read] readFile('data.json') - starting resolution
[storage:read] Searching adapters in priority order: api
[storage:read] Trying adapter: api
[storage:cache] Cache hit for content: 'data.json' @ 'api' (1024 bytes)
[storage:read] readFile('data.json') - completed in 2ms (from cache)
```

### When to Enable

✅ **Enable debug logging when:**
- Troubleshooting file not found errors
- Understanding which adapter is serving files
- Analyzing cache efficiency
- Debugging resolution chain behavior
- Investigating performance issues

❌ **Disable in production** unless actively debugging, as it generates significant log volume.

### Performance Impact

- **When disabled:** Zero overhead (no string operations or function calls)
- **When enabled:** Minimal impact (<1ms per operation)

See `debug-logging-example.ts` for complete examples.

## File Structure

```
agent-library/src/storage/
├── STORAGE.md                          # This documentation
├── agent-storage.ts                    # Main AgentStorage class
├── storage-cache.ts                    # Centralized cache
├── storage-logger.ts                   # Debug logging utility
├── mime-utils.ts                       # MIME type detection
├── types.ts                            # Types and errors
├── index.ts                            # Exports
├── debug-logging-example.ts            # Debug logging examples
└── adapters/
    ├── abstract-storage-adapter.ts     # Base abstract class
    ├── agentplace-api.adapter.ts       # HTTP API adapter
    ├── local-filesystem.adapter.ts     # Local FS adapter
    ├── in-memory.adapter.ts            # Testing adapter
    └── index.ts                        # Adapter exports
```

## Migration from Previous Version

If you were using the old `AgentStorage` with `accessKey`, `apiBaseUrl`, `privateKey`, and `shadowPath`:

```typescript
// OLD (deprecated)
const storage = new AgentStorage({
  accessKey: 'key',
  apiBaseUrl: 'https://api.agentplace.io',
  privateKey: 'user-123',
  shadowPath: '/app/static',
});

// NEW (adapter-based)
const storage = new AgentStorage({
  adapters: [
    { name: 'private', adapter: new AgentPlaceApiAdapter({ 
      apiBaseUrl: 'https://api.agentplace.io',
      accessKey: 'key',
      secretFolder: 'user-123',
    })},
    { name: 'common', adapter: new AgentPlaceApiAdapter({ 
      apiBaseUrl: 'https://api.agentplace.io',
      accessKey: 'key',
    })},
    { name: 'local', adapter: new LocalFileSystemAdapter({ 
      basePath: '/app/static',
    })},
  ],
});

// API changes:
// - readFile({ location: 'private' }) → readFile({ adapter: 'private' })
// - writeFile(path, content, true) → writeFile(path, content, { adapter: 'private' })
// - deleteFile(path, true) → deleteFile(path, { adapter: 'private' })
