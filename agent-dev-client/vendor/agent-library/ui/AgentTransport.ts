/**
 * AgentTransport
 *
 * HTTP+SSE transport for AgentConversation.
 * Use when you want built-in transport instead of custom WebSocket/etc.
 *
 * @example
 * ```typescript
 * const conversation = new AgentConversation({ ... });
 * const transport = new AgentTransport(conversation, { api: '/api/chat' });
 *
 * // Send message via HTTP+SSE
 * await transport.send('Hello!');
 *
 * // Or use conversation.process() for custom transport
 * ```
 */

import type { AgentConversation } from './AgentConversation.ts';
import type { AgentMessagePayload, SendParams } from './types.ts';

/**
 * Headers type compatible with both Node.js and browser environments.
 */
export type TransportHeaders = Record<string, string> | [string, string][];

/**
 * Configuration for AgentTransport.
 */
export interface AgentTransportConfig {
  /** API endpoint for HTTP requests */
  api: string;
  /** Headers for requests (auth, etc.) */
  headers?: TransportHeaders;
}

/**
 * HTTP+SSE transport for AgentConversation.
 * Separates transport concerns from protocol/state management.
 */
export class AgentTransport {
  private conversation: AgentConversation;
  private config: AgentTransportConfig;
  private abortController: AbortController | null = null;

  constructor(conversation: AgentConversation, config: AgentTransportConfig) {
    this.conversation = conversation;
    this.config = config;
  }

  /**
   * Send a message using HTTP+SSE transport.
   *
   * @example
   * ```typescript
   * await transport.send('Hello!');
   * await transport.send({ content: 'Hi', files: [...] });
   * ```
   */
  async send(message: string | SendParams): Promise<void> {
    const params = typeof message === 'string' ? { content: message } : message;

    this.conversation.setStreaming();
    this.abortController = new AbortController();

    try {
      const customHeaders = this.normalizeHeaders(this.config.headers);
      const response = await fetch(this.config.api, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...customHeaders,
        },
        body: JSON.stringify({
          message: { type: 'TXT', content: params.content },
          files: params.files,
          ...params.metadata,
          ...this.conversation.getRequestPayload(),
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Process SSE stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              continue;
            }

            try {
              const payload = JSON.parse(data) as AgentMessagePayload;
              this.conversation.process(payload);
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      this.conversation.setIdle();
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        this.conversation.setIdle();
      } else {
        throw error;
      }
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Stop current stream.
   */
  stop(): void {
    this.abortController?.abort();
    this.conversation.setIdle();
  }

  /**
   * Update transport configuration.
   */
  updateConfig(config: Partial<AgentTransportConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Normalize headers to Record<string, string> format.
   */
  private normalizeHeaders(
    headers?: Record<string, string> | [string, string][],
  ): Record<string, string> {
    if (!headers) {
      return {};
    }
    if (Array.isArray(headers)) {
      return Object.fromEntries(headers);
    }
    return headers;
  }
}
