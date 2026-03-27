/**
 * Shared stream consumer — iterates an AgentContent stream, broadcasts to
 * connected clients, stores content, and emits finish/error signals.
 *
 * Used by both the WebSocket MessageProcessor and the HTTP send-message route.
 */

import type { AgentSession } from '../ws/agent-session';
import type { FinishSignalContent, ErrorSignalContent } from '../../../shared';
import { ContentType, type AgentContent, type ToolContent } from '../bl/agent/agent-library';
import { log } from './logger';

export async function consumeContentStream(
  session: AgentSession,
  stream: AsyncIterable<AgentContent>,
  responseId: string,
): Promise<void> {
  const seenStateUpdates = new Set<string>();

  try {
    for await (const content of stream) {
      if (!content) {
        continue;
      }

      if (content.type === ContentType.Tool) {
        const toolContent = content as ToolContent;
        if (toolContent.tool.name === 'StateUpdate') {
          const stateData = toolContent.content as { conversationHistory?: unknown[] };
          if (stateData?.conversationHistory) {
            const stateKey = JSON.stringify(stateData.conversationHistory);
            if (!seenStateUpdates.has(stateKey)) {
              seenStateUpdates.add(stateKey);
              session.setConversationHistory(stateData.conversationHistory);
            }
          }
          session.broadcastContent({ ...content, responseId });
          continue;
        }
      }

      session.broadcastContent({ ...content, responseId });
      session.pushContent(content);
    }

    const finishContent: FinishSignalContent = {
      type: 'finish',
      messageId: 'finish',
      responseId,
    };
    session.broadcastContent(finishContent);
  } catch (error) {
    const errorContent: ErrorSignalContent = {
      type: 'error',
      messageId: 'error',
      error: error instanceof Error ? error.message : String(error),
      responseId,
    };
    session.broadcastContent(errorContent);

    log('error', {
      event: 'stream.error',
      sessionKey: session.sessionKey,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
