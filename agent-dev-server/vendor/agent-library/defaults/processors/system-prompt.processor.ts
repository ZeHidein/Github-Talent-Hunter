import type { ModelMessage } from '@ai-sdk/provider-utils';
import type { TurnProcessor, TurnProcessorState } from '../../kernel/processors/types.ts';

function isSystemMessage(msg: ModelMessage): msg is Extract<ModelMessage, { role: 'system' }> {
  return msg.role === 'system';
}

/**
 * Ensures the prompt has exactly one system message.
 * - If history already contains a system message, uses the first one found.
 * - Otherwise, inserts the provided default system prompt.
 * - Always places the system message at index 0.
 */
export class SystemPromptProcessor implements TurnProcessor {
  constructor(private getDefaultSystemPrompt: () => string) {}

  async process(state: TurnProcessorState): Promise<ModelMessage[] | null> {
    const history = state.getConversationHistory();
    const firstSystem = history.find(isSystemMessage);

    const systemContent = firstSystem?.content ?? this.getDefaultSystemPrompt();
    const systemMessage: Extract<ModelMessage, { role: 'system' }> = {
      role: 'system',
      content: systemContent,
    };

    const withoutSystem = history.filter((m) => m.role !== 'system');
    const head = history[0];
    const alreadyClean =
      head != null &&
      isSystemMessage(head) &&
      head.content === systemMessage.content &&
      history.slice(1).every((m) => m.role !== 'system');

    if (alreadyClean) {
      return null;
    }
    return [systemMessage, ...withoutSystem];
  }
}
