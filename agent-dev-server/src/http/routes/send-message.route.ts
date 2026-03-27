/**
 * Send Message Route — fire-and-forget HTTP messaging API.
 *
 * POST /api/send-message accepts a message, returns 202 immediately,
 * and processes in the background. Connected WebSocket clients observe
 * the response via the existing content broadcast system.
 */

import { randomUUID } from 'node:crypto';

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SessionManager } from '../../ws/session-manager';
import type { DependencyContainer } from '../../container';
import type { AgentSession } from '../../ws/agent-session';
import type { Route } from './route';
import type { ErrorSignalContent } from '../../../../shared';
import { parseJsonBody } from './parse-json-body';
import { createTextContent } from '../../bl/agent/agent-library';
import { log } from '../../util/logger';
import { getConfigId } from '../../util/config';
import { consumeContentStream } from '../../util/consume-content-stream';

const HTTP_CHANNEL_INSTRUCTION = `

[Channel: HTTP API]
This message was received via the HTTP API, not a browser.
The user cannot see real-time streaming. Provide complete, well-formatted responses.
Do NOT use UI components (they cannot be rendered by the API caller).`;

type SendMessageDeps = {
  sessionManager: SessionManager;
  container: DependencyContainer;
};

export function createSendMessageRoute(deps: SendMessageDeps): Route {
  const { sessionManager, container } = deps;
  const configId = getConfigId(container);

  return {
    matches: (method, url) => method === 'POST' && url === '/api/send-message',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      let body: { session_id?: string; message?: string };
      try {
        body = await parseJsonBody(req);
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode ?? 400;
        const message = err instanceof Error ? err.message : 'Bad request';
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
        return;
      }

      if (!body.message || typeof body.message !== 'string' || !body.message.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'message is required' }));
        return;
      }

      const sessionKey = body.session_id || randomUUID();
      const userId = (req.headers['x-user-id'] as string) || 'api-user';

      const session = await sessionManager.getOrCreate(sessionKey, { userId, configId });

      if (session.status === 'processing') {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session is processing', retryAfter: 2 }));
        return;
      }

      session.setStatus('processing');
      const responseId = randomUUID();

      processInBackground({
        session,
        message: body.message,
        responseId,
        container,
        configId,
      });

      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessionKey, responseId, accepted: true }));
    },
  };
}

async function processInBackground(opts: {
  session: AgentSession;
  message: string;
  responseId: string;
  container: DependencyContainer;
  configId: string;
}): Promise<void> {
  const { session, message, responseId, container, configId } = opts;
  const startTime = Date.now();

  try {
    const userMessageContent = createTextContent({
      messageId: `user-${randomUUID()}`,
      content: message,
      role: 'user',
    });
    session.broadcastContent({ ...userMessageContent, responseId });
    session.pushContent(userMessageContent);

    const messagingService = container.createMessagingService();
    const conversationHistory = session.getConversationHistory();
    const baseInstruction = container.createInstructionService().getInstruction();
    const instruction = baseInstruction
      ? baseInstruction + HTTP_CHANNEL_INSTRUCTION
      : HTTP_CHANNEL_INSTRUCTION.trim();

    const result = await messagingService.sendMessage({
      configId,
      message: { type: 'TXT', content: message },
      instruction,
      conversationHistory,
      sessionKey: session.sessionKey,
    });

    await consumeContentStream(session, result.stream, responseId);

    log('info', {
      event: 'http-message.complete',
      sessionKey: session.sessionKey,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    log('error', {
      event: 'http-message.error',
      sessionKey: session.sessionKey,
      error: error instanceof Error ? error.message : String(error),
    });
    const errorContent: ErrorSignalContent = {
      type: 'error',
      messageId: 'error',
      error: error instanceof Error ? error.message : String(error),
      responseId,
    };
    session.broadcastContent(errorContent);
  } finally {
    session.setStatus('idle');
  }
}
