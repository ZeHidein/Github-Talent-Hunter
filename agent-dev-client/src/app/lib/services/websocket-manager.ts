/**
 * WebSocket Manager
 *
 * Manages a single WebSocket connection for the entire application.
 * Handles message sending/receiving, connection lifecycle, and content distribution.
 */

import { createWebSocketClient, type WebSocketClient } from './websocket-client';
import type {
  ConnectionStatus,
  ContentResumeResult,
  SendMessageOptions,
  SessionInfo,
  AgentStreamContent,
} from './websocket-client.types';

export type ContentHandler = (content: AgentStreamContent) => void;
export type StatusHandler = (status: ConnectionStatus) => void;
export type ErrorHandler = (error: Error) => void;
export type ReconnectHandler = (result: ContentResumeResult) => void;

export type WebSocketManagerSendOptions = Omit<SendMessageOptions, 'instruction'>;

class WebSocketManager {
  private static instance: WebSocketManager | null = null;
  private client: WebSocketClient | null = null;

  // Handlers for direct content streaming
  private contentHandlers = new Set<ContentHandler>();
  // Connection status handlers
  private statusHandlers = new Set<StatusHandler>();
  // Error handlers
  private errorHandlers = new Set<ErrorHandler>();
  // Reconnect handlers
  private reconnectHandlers = new Set<ReconnectHandler>();

  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  /**
   * Initialize and connect to WebSocket server.
   * Idempotent - multiple calls return the same promise.
   */
  async connect(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doConnect();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async doConnect(): Promise<void> {
    console.log('[WebSocketManager] Connecting...');

    this.client = createWebSocketClient();

    // Subscribe to content (direct content streaming)
    this.client.onContent(this.handleContent.bind(this));
    this.client.onStatusChange(this.handleStatusChange.bind(this));
    this.client.onError(this.handleError.bind(this));
    this.client.onReconnect(this.handleReconnect.bind(this));

    await this.client.connect();
    this.isInitialized = true;
    console.log('[WebSocketManager] Connected');
  }

  /**
   * Resume content from server (returns stored content directly).
   */
  async resumeContent(): Promise<ContentResumeResult> {
    if (!this.client) {
      throw new Error('WebSocket not connected');
    }
    return this.client.resumeContent();
  }

  /**
   * Get current session info from server.
   */
  async getSessionInfo(): Promise<SessionInfo> {
    if (!this.client) {
      throw new Error('WebSocket not connected');
    }
    return this.client.getSessionInfo();
  }

  /**
   * Handle direct content messages from WebSocket.
   */
  private handleContent(content: AgentStreamContent): void {
    for (const handler of this.contentHandlers) {
      try {
        handler(content);
      } catch (error) {
        console.error('[WebSocketManager] Content handler error:', error);
      }
    }
  }

  private handleStatusChange(status: ConnectionStatus): void {
    console.log('[WebSocketManager] Status changed:', status);
    for (const handler of this.statusHandlers) {
      try {
        handler(status);
      } catch (error) {
        console.error('[WebSocketManager] Status handler error:', error);
      }
    }
  }

  private handleError(error: Error): void {
    console.error('[WebSocketManager] Error:', error);
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch (err) {
        console.error('[WebSocketManager] Error handler error:', err);
      }
    }
  }

  private handleReconnect(result: ContentResumeResult): void {
    console.log('[WebSocketManager] Reconnected, restoring content');
    for (const handler of this.reconnectHandlers) {
      try {
        handler(result);
      } catch (error) {
        console.error('[WebSocketManager] Reconnect handler error:', error);
      }
    }
  }

  /**
   * Subscribe to direct AgentContent messages.
   * Returns an unsubscribe function.
   */
  onContent(handler: ContentHandler): () => void {
    this.contentHandlers.add(handler);
    return () => this.contentHandlers.delete(handler);
  }

  /**
   * Subscribe to connection status changes.
   * Returns an unsubscribe function.
   */
  onStatusChange(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  /**
   * Subscribe to errors.
   * Returns an unsubscribe function.
   */
  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  /**
   * Subscribe to reconnect events.
   * Called with the full resume result after a successful reconnect.
   * Returns an unsubscribe function.
   */
  onReconnect(handler: ReconnectHandler): () => void {
    this.reconnectHandlers.add(handler);
    return () => this.reconnectHandlers.delete(handler);
  }

  /**
   * Send a message to the server.
   * Returns the server response including responseId for abort correlation.
   */
  async sendMessage(
    content: string,
    options?: WebSocketManagerSendOptions,
  ): Promise<{ accepted?: boolean; queued?: boolean; responseId?: string }> {
    if (!this.client) {
      throw new Error('WebSocket not connected');
    }

    return this.client.sendMessage(content, {
      files: options?.files,
      memoryBank: options?.memoryBank,
      metadata: options?.metadata,
      hidden: options?.hidden,
    });
  }

  async sendMessageForQuery(
    content: string,
    options?: WebSocketManagerSendOptions,
  ): Promise<{ responseId: string; queued: boolean }> {
    if (!this.client) {
      throw new Error('WebSocket not connected');
    }

    const result = await this.client.sendMessage(content, {
      files: options?.files,
      memoryBank: options?.memoryBank,
      metadata: options?.metadata,
      hidden: options?.hidden,
    });

    const responseId = result?.responseId;
    if (typeof responseId !== 'string' || !responseId) {
      throw new Error('Server did not return responseId');
    }

    return { responseId, queued: Boolean(result.queued) };
  }

  /**
   * Abort an active stream by responseId.
   * Best-effort: errors are silently caught by the caller.
   */
  async abortStream(responseId: string): Promise<{ aborted: boolean }> {
    if (!this.client) {
      throw new Error('WebSocket not connected');
    }
    return this.client.abortStream(responseId);
  }

  /**
   * Disconnect from WebSocket server.
   */
  disconnect(): void {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
    this.isInitialized = false;
    console.log('[WebSocketManager] Disconnected');
  }

  /**
   * Get current connection status.
   */
  get status(): ConnectionStatus {
    return this.client?.status || 'disconnected';
  }

  /**
   * Check if connected.
   */
  get isConnected(): boolean {
    return this.client?.isConnected || false;
  }
}

// Export singleton instance
export const wsManager = WebSocketManager.getInstance();
