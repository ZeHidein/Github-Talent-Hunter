import type { LanguageModelUsage } from 'ai';
import type { ModelMessage } from '@ai-sdk/provider-utils';
import type { Attachment } from '../../core/interfaces.ts';

/**
 * TurnProcessor
 *
 * A turn-level hook that is conceptually different from model middlewares:
 * - Runs once per agent turn (not per model call / per step).
 * - May intentionally commit changes into canonical conversation history.
 */
export interface TurnProcessorState {
  // turn input idempotency helpers
  hasTurnInputInjected(): boolean;
  markTurnInputInjected(): void;

  // current turn input
  getUserQueryText(): string | undefined;
  getLastUsage(): LanguageModelUsage | undefined;
  getAttachments(): Attachment[];

  // canonical history
  getConversationHistory(): ModelMessage[];
  setConversationHistory(history: ModelMessage[]): void;
}

export interface TurnProcessor {
  process(state: TurnProcessorState): Promise<ModelMessage[] | null>;
}
