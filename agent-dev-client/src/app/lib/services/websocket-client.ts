import type {
  ConnectionStatus,
  WebSocketClientOptions,
  SendMessageOptions,
  ContentResumeResult,
  SessionInfo,
  AgentStreamContent,
} from './websocket-client.types';
import { getWsBaseUrl } from './api-url';
import { getComponentConfigs } from '../components/registry';
import { AgentAuth } from '../agent-auth';
import { setRpcPeer } from '../trpc';
import { invalidationRegistry } from '../invalidation-registry';
import { RetryLoop } from '@/lib/agent-library';
import { RpcPeer } from '../../../../vendor/agentplace-transport/RpcPeer';
import { BrowserWebSocketWrapperAdapter } from '../../../../vendor/agentplace-transport/adapters/BrowserWebSocketWrapperAdapter';

/**
 * WebSocket client for communicating with the agent-dev-server
 */
export class WebSocketClient {
  #ws: WebSocket | null = null;
  #rpcPeer: RpcPeer | null = null;
  #url: string;
  #status: ConnectionStatus = 'disconnected';
  #lastContentSeq = 0;

  // Injected dependencies
  #getAgentSessionId: () => string | null;
  #wsFactory: (url: string) => WebSocket;
  #onSessionJoined: (sessionKey: string) => void;

  // Reconnection
  #shouldReconnect = true;
  #retryLoop = new RetryLoop({
    maxAttempts: 10,
    delayMs: 1000,
    backoff: 'exponential',
    jitterMs: 1000,
  });

  // Content listeners (for direct content streaming)
  #contentListeners = new Set<(content: AgentStreamContent) => void>();
  #statusListeners = new Set<(status: ConnectionStatus) => void>();
  #errorListeners = new Set<(error: Error) => void>();
  #reconnectListeners = new Set<(result: ContentResumeResult) => void>();

  constructor(options: WebSocketClientOptions) {
    this.#getAgentSessionId = options.getAgentSessionId ?? (() => null);
    this.#wsFactory = options.createWebSocket ?? ((url) => new WebSocket(url));
    this.#onSessionJoined = options.onSessionJoined ?? (() => {});
    this.#url = this.#buildUrl(options.baseUrl);
  }

  #buildUrl(baseUrl?: string): string {
    const base = baseUrl || getWsBaseUrl();
    const url = new URL('/ws', base);
    // Convert http/https to ws/wss if needed (preserves existing ws/wss)
    if (url.protocol === 'https:') {
      url.protocol = 'wss:';
    } else if (url.protocol === 'http:') {
      url.protocol = 'ws:';
    }
    // Read agent_session_id from injected callback first, then fall back to URL params
    const agentSessionId =
      this.#getAgentSessionId() ||
      new URLSearchParams(window.location.search).get('agent_session_id');
    if (agentSessionId) {
      url.searchParams.set('agent_session_id', agentSessionId);
    }
    return url.toString();
  }

  // --- Connection Management ---

  async connect(): Promise<void> {
    if (this.#ws && this.#ws.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    this.#shouldReconnect = true;
    this.#status = 'connecting';
    this.#notifyStatusChange();

    // Rebuild URL to get latest session ID (may have been set after initial construction)
    this.#url = this.#buildUrl();

    return new Promise((resolve, reject) => {
      try {
        this.#ws = this.#wsFactory(this.#url);
      } catch (error) {
        this.#status = 'disconnected';
        this.#notifyStatusChange();
        reject(new Error('Failed to create WebSocket'));
        return;
      }

      this.#ws.onopen = async () => {
        // Create RpcPeer for this connection using the library adapter
        const transport = new BrowserWebSocketWrapperAdapter(this.#ws!);
        this.#rpcPeer = new RpcPeer(transport);
        setRpcPeer(this.#rpcPeer);

        // Route server notifications — same { method, params } format as before
        this.#rpcPeer.onNotify<{ method: string; params: unknown }>((p) => {
          switch (p.method) {
            case 'content':
              this.#handleContent(p.params as AgentStreamContent);
              break;
            case 'session.joined': {
              console.log('[WebSocketClient] Session joined:', p.params);
              const params = p.params as { sessionKey?: string };
              if (params?.sessionKey) {
                this.#onSessionJoined(params.sessionKey);
              }
              break;
            }
            case 'message.started':
              console.log('[WebSocketClient] Queued message started:', p.params);
              break;
            case 'message.error':
              console.error('[WebSocketClient] Message error:', p.params);
              break;
            case 'data.invalidate': {
              const { topic } = p.params as { topic: string };
              invalidationRegistry.notify(topic);
              break;
            }
            case 'error':
              this.#notifyError(new Error((p.params as any)?.message || 'Unknown error'));
              break;
            default:
              console.log('[WebSocketClient] Unknown notification:', p.method);
          }
        });

        this.#status = 'connected';
        this.#notifyStatusChange();
        console.log('[WebSocketClient] Connected');

        // Register component configs with the server
        try {
          await this.registerComponents();
        } catch (error) {
          console.error('[WebSocketClient] Failed to register components:', error);
        }

        resolve();
      };

      this.#ws.onerror = (event) => {
        console.error('[WebSocketClient] Error:', event);
        if (this.#status === 'connecting') {
          reject(new Error('WebSocket connection failed'));
        }
      };

      this.#ws.onclose = (event) => {
        this.#handleClose(event);
      };
    });
  }

  disconnect(): void {
    console.log('[WebSocketClient] Disconnecting...');
    this.#shouldReconnect = false;
    this.#retryLoop.cancel();

    if (this.#ws) {
      this.#ws.close(1000, 'Client disconnect');
      this.#ws = null;
    }

    setRpcPeer(null);
    this.#rpcPeer = null;
    this.#status = 'disconnected';
    this.#notifyStatusChange();
  }

  #handleClose(event: CloseEvent): void {
    this.#ws = null;
    setRpcPeer(null);
    this.#rpcPeer = null;

    // Check if should reconnect
    if (event.code === 4001) {
      // Authentication failed - don't reconnect
      console.log('[WebSocketClient] Authentication failed, not reconnecting');
      this.#status = 'disconnected';
      this.#notifyError(new Error('Authentication error'));
    } else if (this.#shouldReconnect && event.code !== 1000) {
      // Unexpected close - attempt reconnect
      console.log(`[WebSocketClient] Unexpected close (${event.code}), reconnecting...`);
      this.#startReconnect();
    } else {
      this.#status = 'disconnected';
    }

    this.#notifyStatusChange();
  }

  // --- Reconnection ---

  #startReconnect(): void {
    this.#status = 'reconnecting';
    this.#notifyStatusChange();

    this.#retryLoop
      .start({
        isStillNeeded: () => this.#shouldReconnect,
        attemptOnce: async () => {
          await this.connect();
          const resume = await this.resumeContent();
          // Invalidate all live queries after reconnect — data may have changed while offline
          invalidationRegistry.notifyAll();
          for (const listener of this.#reconnectListeners) {
            listener(resume);
          }
          return true;
        },
      })
      .then(() => {
        // If still not connected after all attempts, notify error
        if (this.#shouldReconnect && this.#status !== 'connected') {
          this.#status = 'disconnected';
          this.#notifyError(new Error('Max reconnection attempts reached'));
          this.#notifyStatusChange();
        }
      });
  }

  // --- Content Handling ---

  #handleContent(content: AgentStreamContent): void {
    // Notify listeners
    for (const listener of this.#contentListeners) {
      try {
        listener(content);
      } catch (error) {
        console.error('[WebSocketClient] Content listener error:', error);
      }
    }
  }

  // --- RPC API ---

  async sendMessage(
    content: string,
    options?: SendMessageOptions,
  ): Promise<{ accepted?: boolean; queued?: boolean; responseId?: string }> {
    if (!this.#rpcPeer) throw new Error('Not connected');
    return this.#rpcPeer.ask(
      {
        method: 'message.send',
        content,
        files: options?.files,
        instruction: options?.instruction,
        memoryBank: options?.memoryBank,
        metadata: options?.metadata,
        hidden: options?.hidden,
      },
      { timeout: 30000 },
    );
  }

  /**
   * Resume content from server - returns stored content directly.
   */
  async resumeContent(): Promise<ContentResumeResult> {
    if (!this.#rpcPeer) throw new Error('Not connected');
    const result = await this.#rpcPeer.ask<ContentResumeResult>({
      method: 'content.resume',
      afterSeq: this.#lastContentSeq,
    });
    // Update last content seq to the highest returned
    if (result.contents.length > 0) {
      this.#lastContentSeq = result.contents[result.contents.length - 1].seq;
    }
    console.log(`[WebSocketClient] Resumed content: replayed ${result.replayed} items`);
    return result;
  }

  async getSessionInfo(): Promise<SessionInfo> {
    if (!this.#rpcPeer) throw new Error('Not connected');
    return this.#rpcPeer.ask<SessionInfo>({ method: 'session.info' });
  }

  /**
   * Abort an active stream by responseId.
   * Best-effort: silently ignores failures (e.g. stream already finished).
   */
  async abortStream(responseId: string): Promise<{ aborted: boolean }> {
    if (!this.#rpcPeer) throw new Error('Not connected');
    return this.#rpcPeer.ask<{ aborted: boolean }>({ method: 'message.abort', responseId });
  }

  /**
   * Register component configs with the server.
   * Called automatically on connection to enable dynamic component tools.
   */
  async registerComponents(): Promise<void> {
    if (!this.#rpcPeer) throw new Error('Not connected');
    const configs = getComponentConfigs();
    const componentList = Object.values(configs);
    if (componentList.length === 0) {
      return;
    }
    await this.#rpcPeer.ask({ method: 'components.register', components: componentList });
    console.log(`[WebSocketClient] Registered ${componentList.length} component configs`);
  }

  // --- Content Subscription ---

  /**
   * Subscribe to content messages.
   */
  onContent(listener: (content: AgentStreamContent) => void): () => void {
    this.#contentListeners.add(listener);
    return () => this.#contentListeners.delete(listener);
  }

  onStatusChange(listener: (status: ConnectionStatus) => void): () => void {
    this.#statusListeners.add(listener);
    // Immediately notify of current status
    listener(this.#status);
    return () => this.#statusListeners.delete(listener);
  }

  onError(listener: (error: Error) => void): () => void {
    this.#errorListeners.add(listener);
    return () => this.#errorListeners.delete(listener);
  }

  onReconnect(listener: (result: ContentResumeResult) => void): () => void {
    this.#reconnectListeners.add(listener);
    return () => this.#reconnectListeners.delete(listener);
  }

  #notifyStatusChange(): void {
    for (const listener of this.#statusListeners) {
      try {
        listener(this.#status);
      } catch (error) {
        console.error('[WebSocketClient] Status listener error:', error);
      }
    }
  }

  #notifyError(error: Error): void {
    for (const listener of this.#errorListeners) {
      try {
        listener(error);
      } catch (err) {
        console.error('[WebSocketClient] Error listener error:', err);
      }
    }
  }

  // --- Getters ---

  get status(): ConnectionStatus {
    return this.#status;
  }

  get lastContentSeq(): number {
    return this.#lastContentSeq;
  }

  get isConnected(): boolean {
    return this.#status === 'connected';
  }
}

/**
 * Create a WebSocket client wired to AgentAuth for session tracking.
 * This is the only place that imports AgentAuth — the WebSocketClient class itself
 * is decoupled and receives dependencies via constructor options.
 */
export function createWebSocketClient(): WebSocketClient {
  return new WebSocketClient({
    getAgentSessionId: () => AgentAuth.agentSessionId,
    createWebSocket: (url: string) => AgentAuth.createWebSocket(url),
    onSessionJoined: (key: string) => AgentAuth.setSessionId(key),
  });
}
