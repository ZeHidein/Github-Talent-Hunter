/**
 * Node.js-specific exports
 * Use: import { ... } from 'agentplace-transport/node'
 */

// Re-export everything from core
export * from './index.ts';

// Node.js adapters (no DOM dependencies)
export {
  WebSocketServerAdapter,
  type WebSocketLike,
  type WebSocketServerAdapterOptions,
} from './adapters/WebSocketServerAdapter.ts';

// WebSocket client - works in Node.js 21+ (global WebSocket)
export { WebSocketAdapter, type WebSocketAdapterOptions } from './adapters/WebSocketAdapter.ts';
