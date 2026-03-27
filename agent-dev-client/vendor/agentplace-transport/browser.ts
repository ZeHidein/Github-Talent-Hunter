/**
 * Browser-specific exports
 * Use: import { ... } from 'agentplace-transport/browser'
 */

// Re-export everything from core
export * from './index.ts';

// Browser-specific adapters (require DOM)
export { WebSocketAdapter } from './adapters/WebSocketAdapter.ts';
export { BrowserWebSocketWrapperAdapter } from './adapters/BrowserWebSocketWrapperAdapter.ts';
export { IframeParentAdapter, IframeChildAdapter } from './adapters/IframeAdapter.ts';
