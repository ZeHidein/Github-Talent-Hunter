/**
 * MCP Client — SDK re-exports.
 *
 * Replaces the custom JSON-RPC / SSE / StreamableHTTP implementation
 * with the official @modelcontextprotocol/sdk client.
 *
 * Consumers continue to import from this file; names are unchanged.
 */

export { Client as MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
export { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
export { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Backward-compat type aliases used by mcp-tool-model.ts
export type MCPCallToolResult = {
  content?: Array<{ type?: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
  [key: string]: unknown;
};

export type MCPListToolsResult = {
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};
