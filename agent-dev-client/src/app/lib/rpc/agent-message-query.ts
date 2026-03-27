import type {
  AgentAskMessage,
  AgentMessageQueryResponse,
} from '../../../../vendor/agentplace-transport';

import type { Container } from '../../container';
import {
  ContentType,
  type AgentContent,
  type ComponentContent,
  type ToolContent,
} from '@/lib/agent-library';

function isStateUpdateToolContent(content: AgentContent): boolean {
  if (content.type !== ContentType.Tool) {
    return false;
  }
  return (content as ToolContent).tool.name === 'StateUpdate';
}

function isUserRoleContent(content: AgentContent): boolean {
  return content.role === 'user';
}

function isFinalContent(content: AgentContent): boolean {
  if (content.type !== ContentType.Component) {
    return true;
  }
  const state = (content as ComponentContent).streaming?.state;
  return !state || state === 'output-available' || state === 'output-error';
}

function toAgentMessageQueryResponses(
  contents: AgentContent[],
): AgentMessageQueryResponse['responses'] {
  return contents.map((c) => {
    return {
      type: c.type,
      role: 'assistant',
      content:
        c.type === ContentType.Component
          ? {
              componentName: (c as ComponentContent).componentName,
              props: (c as ComponentContent).props,
            }
          : c.content,
      componentName:
        c.type === ContentType.Component ? (c as ComponentContent).componentName : undefined,
    };
  });
}

export async function handleAgentMessageQuery(args: {
  container: Container;
  queryPayload: Extract<AgentAskMessage, { type: 'agent.message.query' }>;
}): Promise<AgentMessageQueryResponse> {
  const { container, queryPayload } = args;
  const messagesStore = container.messagesStore;
  if (!messagesStore) {
    return {
      success: false,
      responses: [],
      userMessage: queryPayload.message,
      error: 'Messages store not available',
    };
  }

  const { responseId, done } = await messagesStore.sendMessageForQuery({
    instruction: queryPayload.message,
  });

  await done;

  const allMessages = messagesStore.contents;
  const responseOnly = allMessages.filter(
    (c) =>
      c.responseId === responseId &&
      !isUserRoleContent(c) &&
      !isStateUpdateToolContent(c) &&
      !c.hidden,
  );
  const finalOnly = responseOnly.filter(isFinalContent);

  return {
    success: true,
    responses: toAgentMessageQueryResponses(finalOnly),
    userMessage: queryPayload.message,
  };
}
