/**
 * Filesystem Tool
 *
 * Unified tool for file operations in agent storage using AgentStorageFactoryService.
 * Supports list, read, and write operations through a single tool interface.
 */
import { z } from 'zod';
import {
  ToolModel,
  type AgentState,
  type ToolExecuteContext,
  type ToolExecuteResult,
} from '../../agent/agent-library';
import type { AgentStorageFactoryService } from '../../../services/agent-storage-factory.service';
import { getSessionKey, type DevServerAppState } from '../../agent/agent-state';

const FilesystemSchema = z.object({
  action: z
    .enum(['list', 'read', 'write'])
    .describe(
      'The filesystem operation: "list" (list files), "read" (read file), "write" (write file)',
    ),

  // Used by: read, write
  filePath: z.string().optional().describe('Path of the file (required for read and write)'),

  // Used by: write
  content: z.string().optional().describe('Content to write (required for write operation)'),

  // Used by: read, write
  encoding: z
    .enum(['utf8', 'base64'])
    .default('utf8')
    .describe('Encoding: "base64" for binary files, "utf8" for text'),

  // Used by: list, read, write
  adapter: z.string().optional().describe('Specific adapter name to use (optional)'),

  // Used by: list
  adapters: z
    .array(z.string())
    .optional()
    .describe('Array of adapter names for list operation (optional)'),

  // Used by: write
  compression: z
    .boolean()
    .default(false)
    .describe('Compress file when writing (for large files) using Zstandard compression'),
});

type FilesystemInput = z.infer<typeof FilesystemSchema>;

export class FilesystemTool extends ToolModel<FilesystemInput> {
  #storageFactory: AgentStorageFactoryService;

  constructor(params: {
    storageFactory: AgentStorageFactoryService;
  }) {
    super({
      name: 'filesystem',
      description:
        'Perform file operations on agent storage. Actions: "list" (list all files with metadata), "read" (read file content as text or base64), "write" (write content to file with optional compression).',
      parametersSchema: FilesystemSchema,
      toolType: 'function',
      isStrict: false,
    });

    this.#storageFactory = params.storageFactory;
  }

  async execute(input: FilesystemInput, ctx: ToolExecuteContext): Promise<ToolExecuteResult> {
    const agentState = ctx.runner.state as AgentState<unknown, DevServerAppState>;
    const secretFolder = getSessionKey(agentState);

    try {
      switch (input.action) {
        case 'list':
          return await this.#handleList(input, secretFolder);
        case 'read':
          return await this.#handleRead(input, secretFolder);
        case 'write':
          return await this.#handleWrite(input, secretFolder);
        default:
          return {
            output: `Unknown action: ${input.action}`,
            uiProps: { error: 'Invalid action' },
          };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        output: `Filesystem error (${input.action}): ${errorMsg}`,
        uiProps: {
          error: errorMsg,
          action: input.action,
        },
      };
    }
  }

  async #handleList(input: FilesystemInput, secretFolder: string): Promise<ToolExecuteResult> {
    const storage = this.#storageFactory.getStorage(secretFolder);
    const files = await storage.listFiles(input.adapters);

    // Format file list for better readability
    const fileList = files.map((file) => {
      const parts = [
        `- ${file.path}`,
        `  Size: ${this.#formatBytes(file.size)}`,
        `  Type: ${file.contentType || 'unknown'}`,
        `  Adapter: ${file.adapter}`,
      ];

      if (file.uploadedAt) {
        parts.push(`  Uploaded: ${new Date(file.uploadedAt).toISOString()}`);
      }

      if (file.isCompressed && file.originalSize) {
        parts.push(
          `  Compressed: ${this.#formatBytes(file.originalSize)} → ${this.#formatBytes(file.size)}`,
        );
      }

      if (file.additionalAdapters && file.additionalAdapters.length > 0) {
        parts.push(`  Also in: ${file.additionalAdapters.map((a) => a.adapter).join(', ')}`);
      }

      return parts.join('\n');
    });

    const output =
      files.length > 0
        ? `Found ${files.length} file(s):\n\n${fileList.join('\n\n')}`
        : 'No files found in storage.';

    return {
      output,
      uiProps: {
        action: 'list',
        files,
        count: files.length,
      },
    };
  }

  async #handleRead(input: FilesystemInput, secretFolder: string): Promise<ToolExecuteResult> {
    if (!input.filePath) {
      throw new Error('filePath is required for read operation');
    }

    const storage = this.#storageFactory.getStorage(secretFolder);
    const options = input.adapter ? { adapter: input.adapter } : undefined;
    const buffer = await storage.readFile(input.filePath, options);

    let content: string;
    let outputMsg: string;

    if (input.encoding === 'base64') {
      content = buffer.toString('base64');
      outputMsg = `File "${input.filePath}" read successfully (${buffer.length} bytes, base64-encoded).`;
    } else {
      content = buffer.toString('utf8');
      outputMsg = `File "${input.filePath}" read successfully (${buffer.length} bytes):\n\n${content}`;
    }

    return {
      output: outputMsg,
      uiProps: {
        action: 'read',
        filePath: input.filePath,
        content,
        encoding: input.encoding,
        size: buffer.length,
        adapter: input.adapter,
      },
    };
  }

  async #handleWrite(input: FilesystemInput, secretFolder: string): Promise<ToolExecuteResult> {
    if (!input.filePath) {
      throw new Error('filePath is required for write operation');
    }
    if (input.content === undefined) {
      throw new Error('content is required for write operation');
    }

    const storage = this.#storageFactory.getStorage(secretFolder);

    // Convert content to Buffer based on encoding
    let buffer: Buffer;
    if (input.encoding === 'base64') {
      buffer = Buffer.from(input.content, 'base64');
    } else {
      buffer = Buffer.from(input.content, 'utf8');
    }

    // Write options
    const options = {
      adapter: input.adapter,
      compression: input.compression,
    };

    const result = await storage.writeFile(input.filePath, buffer, options);

    const compressionNote = input.compression ? ` (compressed from ${buffer.length} bytes)` : '';

    return {
      output: `File "${input.filePath}" written successfully to adapter "${result.adapter}" (${buffer.length} bytes${compressionNote}).`,
      uiProps: {
        action: 'write',
        filePath: input.filePath,
        adapter: result.adapter,
        size: buffer.length,
        compressed: input.compression,
        encoding: input.encoding,
      },
    };
  }

  #formatBytes(bytes: number): string {
    if (bytes === 0) {
      return '0 B';
    }
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
  }
}
