/**
 * RetrievePreviewMessagesTool
 *
 * Tool that retrieves the messages between the user and the agent being built.
 * Uses the agent-library execute() API.
 */
import { z } from 'zod';
import {
  ToolModel,
  type AgentState,
  type ToolExecuteContext,
  type ToolExecuteResult,
} from '../../agent/agent-library';
import type { AgentMessageT, PreviewMessageT } from '../../../types';
import { getRenderedMessages, type DevServerAppState } from '../../agent/agent-state';

const COMPONENT_NAME = 'RetrieveRenderedMessages';

// Empty schema - this tool takes no parameters
const RetrievePreviewMessagesSchema = z.object({});

type RetrievePreviewMessagesInput = z.infer<typeof RetrievePreviewMessagesSchema>;

export function prepareRenderedMessages(renderedMessages: PreviewMessageT[]): string {
  const agentMessages = renderedMessages.filter(
    (msg) => msg.type === 'Component',
  ) as AgentMessageT[];
  const results = agentMessages.map((msg) => {
    const text = `Component id: ${msg.id}\nComponent name: ${msg.componentName}\nComponent props: ${JSON.stringify(msg.content?.props)}`;
    return text;
  });

  return results.join('\n\n');
}

export function getPreparedPreviewMessages(renderedMessages: PreviewMessageT[]): string {
  return prepareRenderedMessages(renderedMessages);
}

export class RetrievePreviewMessagesTool extends ToolModel<RetrievePreviewMessagesInput> {
  constructor() {
    super({
      toolType: 'function',
      name: COMPONENT_NAME,
      description: 'Tool that retrieves the messages between the user and the agent being built.',
      parametersSchema: RetrievePreviewMessagesSchema,
      isStreaming: false,
      isStrict: false,
    });
  }

  async execute(
    input: RetrievePreviewMessagesInput,
    ctx: ToolExecuteContext,
  ): Promise<ToolExecuteResult> {
    // Get rendered messages from the state's app context
    const state = ctx.runner.state as AgentState<unknown, DevServerAppState>;
    const renderedMessages = getRenderedMessages(state);
    const compressedPreviewMessages = getPreparedPreviewMessages(renderedMessages);

    return {
      output: compressedPreviewMessages || 'No preview messages available',
      uiProps: {
        messages: compressedPreviewMessages,
      },
    };
  }

  override getComponentName(): string {
    return COMPONENT_NAME;
  }
}
