/**
 * MessageProcessor
 *
 * Processes WebSocket messages and streams agent responses.
 * Broadcasts AgentContent directly to clients.
 */
import { randomUUID } from 'crypto';

import type { RpcPeer } from '../../vendor/agentplace-transport/RpcPeer';
import type { AgentSession } from './agent-session';
import type { MessageSendParams } from './agent-session.types';
import type { DependencyContainer } from '../container';
import type { ErrorSignalContent } from '../../../shared';
import {
  type AgentContent,
  type CancelableStream,
  createTextContent,
} from '../bl/agent/agent-library';
import { log } from '../util/logger';
import { consumeContentStream } from '../util/consume-content-stream';

export interface MessageProcessorOptions {
  container: DependencyContainer;
}

export class MessageProcessor {
  #container: DependencyContainer;

  /**
   * Active streams keyed by sessionKey so we can abort the current stream
   * for a given session. Only one stream is active per session at a time.
   */
  #activeStreams = new Map<
    string,
    { responseId: string; stream: CancelableStream<AgentContent> }
  >();

  constructor(options: MessageProcessorOptions) {
    this.#container = options.container;
  }

  /**
   * Handle message.abort RPC - abort the active stream for a session.
   */
  async handleMessageAbort(
    session: AgentSession,
    params: Record<string, unknown>,
  ): Promise<{ aborted: boolean; reason?: string }> {
    const responseId = params.responseId as string | undefined;

    if (!responseId || typeof responseId !== 'string') {
      throw new Error('responseId is required');
    }

    const active = this.#activeStreams.get(session.sessionKey);

    if (!active || active.responseId !== responseId) {
      return { aborted: false, reason: 'nothing_to_abort' };
    }

    log('info', {
      event: 'message.abort',
      sessionKey: session.sessionKey,
      responseId,
    });

    active.stream.abort();
    this.#activeStreams.delete(session.sessionKey);

    return { aborted: true };
  }

  async handleMessageSend(
    rpcPeer: RpcPeer,
    connectionId: string,
    session: AgentSession,
    params: Record<string, unknown>,
  ): Promise<{ accepted?: boolean; queued?: boolean; responseId: string }> {
    const content = params.content as string | undefined;

    if (typeof content !== 'string') {
      throw new Error('content is required');
    }

    if (!content.trim() && !params.hidden) {
      throw new Error('content must not be empty');
    }

    const sendParams: MessageSendParams = {
      content,
      files: params.files as any,
      instruction: params.instruction as string | undefined,
      memoryBank: params.memoryBank as any,
      metadata: params.metadata as Record<string, unknown> | undefined,
      hidden: params.hidden as boolean | undefined,
    };

    // Flush action log entries accumulated since last message
    const pendingActions = session.actionLog.flush();
    if (pendingActions.length > 0) {
      sendParams.metadata = {
        ...sendParams.metadata,
        actionsSinceLastMessage: pendingActions,
      };
    }

    const responseId = randomUUID();

    if (session.status === 'processing') {
      const queued = session.queueMessage(
        randomUUID(),
        sendParams,
        rpcPeer,
        connectionId,
        responseId,
      );
      if (!queued) {
        throw new Error('Message already pending');
      }
      return { queued: true, responseId };
    }

    session.setStatus('processing');

    log('info', {
      event: 'message.processing',
      sessionKey: session.sessionKey,
      contentLength: content.length,
    });

    this.#executeMessage(session, sendParams, responseId);

    return { accepted: true, responseId };
  }

  /**
   * Run message processing in the background.
   * Not awaited — the RPC response is sent before processing starts.
   */
  #executeMessage(session: AgentSession, params: MessageSendParams, responseId: string): void {
    const startTime = Date.now();
    this.processMessage(session, params, responseId)
      .then(() => {
        log('info', {
          event: 'message.complete',
          sessionKey: session.sessionKey,
          durationMs: Date.now() - startTime,
        });
      })
      .catch((error) => {
        log('error', {
          event: 'agent.error',
          sessionKey: session.sessionKey,
          error: error instanceof Error ? error.message : String(error),
          errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
          stack: error instanceof Error ? error.stack : undefined,
        });
        const errorContent: ErrorSignalContent = {
          type: 'error',
          messageId: 'error',
          error: error instanceof Error ? error.message : String(error),
          responseId,
        };
        session.broadcastContent(errorContent);
      })
      .finally(() => {
        session.setStatus('idle');
        this.processQueuedMessage(session);
      });
  }

  private async processMessage(
    session: AgentSession,
    params: MessageSendParams,
    responseId: string,
  ): Promise<void> {
    const messagingService = this.#container.createMessagingService();

    const message = {
      type: 'TXT' as const,
      content: params.content,
    };

    const conversationHistory = session.getConversationHistory();

    // Always emit user message as content; client decides rendering via `hidden`
    const userMessageContent = createTextContent({
      messageId: `user-${randomUUID()}`,
      content: params.content,
      role: 'user',
      hidden: params.hidden || undefined,
    });
    const enrichedUserMessage = { ...userMessageContent, responseId };
    session.broadcastContent(enrichedUserMessage);
    session.pushContent(userMessageContent);

    const result = await messagingService.sendMessage({
      configId: session.configId,
      message,
      conversationHistory,
      instruction: params.instruction,
      files: params.files || [],
      sessionKey: session.sessionKey,
      memories: params.memoryBank,
      metadata: params.metadata,
      componentConfigs: session.getComponentConfigs(),
    });

    // Track the active stream so it can be aborted via message.abort
    this.#activeStreams.set(session.sessionKey, {
      responseId,
      stream: result.stream,
    });

    try {
      await consumeContentStream(session, result.stream, responseId);
    } finally {
      // Clean up active stream reference
      this.#activeStreams.delete(session.sessionKey);
    }
  }

  private async processQueuedMessage(session: AgentSession): Promise<void> {
    const pending = session.dequeueMessage();
    if (!pending) {
      return;
    }

    session.setStatus('processing');

    // Merge any new actions accumulated while message was queued
    const queuedActions = session.actionLog.flush();
    if (queuedActions.length > 0) {
      const existing = (pending.params.metadata?.actionsSinceLastMessage as unknown[]) || [];
      pending.params.metadata = {
        ...pending.params.metadata,
        actionsSinceLastMessage: [...existing, ...queuedActions],
      };
    }

    try {
      pending.rpcPeer
        .notify(
          {
            method: 'message.started',
            params: { id: pending.id, responseId: pending.responseId },
          },
          { requireAck: false },
        )
        .catch(() => {});

      await this.processMessage(session, pending.params, pending.responseId);
    } catch (error) {
      log('error', {
        event: 'queue.error',
        sessionKey: session.sessionKey,
        error: error instanceof Error ? error.message : String(error),
      });
      pending.rpcPeer
        .notify(
          {
            method: 'message.error',
            params: {
              id: pending.id,
              responseId: pending.responseId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          { requireAck: false },
        )
        .catch(() => {});
    } finally {
      session.setStatus('idle');
      this.processQueuedMessage(session);
    }
  }
}
