import type { ModelMessage } from '@ai-sdk/provider-utils';
import type { TurnProcessor, TurnProcessorState } from '../kernel/processors/types.ts';

/**
 * Applies turn-level processors in order.
 *
 * Processors may return an updated conversation history; when they do, we persist it to state
 * so subsequent processors see the new history.
 */
export async function applyProcessors(params: {
  state: TurnProcessorState;
  processors: TurnProcessor[];
}): Promise<ModelMessage[]> {
  const { state, processors } = params;
  let messages: ModelMessage[] = state.getConversationHistory();

  for (const processor of processors) {
    const next = await processor.process(state);
    if (next) {
      state.setConversationHistory(next);
    }
    messages = state.getConversationHistory();
  }

  return messages;
}
