import type { ModelMessage } from '@ai-sdk/provider-utils';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { AgentMode } from '../types/mode.ts';
import type { IToolRegistry } from '../tools/tool-registry.ts';
import type { KernelModelMiddleware } from '../kernel/middlewares/index.ts';
import type { TurnProcessor } from '../kernel/processors/types.ts';
import type { AgentTurnRequest } from './agent-state.ts';

export type Attachment = {
  type: string;
  name: string;
  data: string;
  updateTms: number;
  description?: string;
  url?: string;
};

export interface CreateAgentParams {
  agentMode?: AgentMode;
  systemInstruction: string;
  limits?: {
    maxTurns?: number;
    maxModelCalls?: number;
    maxRetries?: number;
  };
  toolRegistry?: IToolRegistry;
  model?: LanguageModelV3;
  modelSettings?: {
    temperature?: number;
    maxOutputTokens?: number;
    providerOptions?: ProviderOptions;
  };
  modelMiddlewares?: KernelModelMiddleware[];
  processors?: TurnProcessor[];
  /** Initial state request. Use `AgentState.fromSnapshot()` for easy restoration. */
  state?: AgentTurnRequest;
  /** Trace name for observability. */
  traceName?: string;
}

export interface IAgentState<TAppContext = unknown> {
  getAppContext(): TAppContext | null;
  setError(error: Error | null): void;
  getError(): Error | null;
  increaseModelCallsCount(): void;
  getModelCallsCount(): number;
  increaseRetriesCount(): void;
  getRetriesCount(): number;
  getRemindersCount(): number;
  getModelId(): string | null;
  setModelId(modelId: string | null): void;
  getProvider(): string | null;
  setProvider(provider: string | null): void;
  getAttachments(): Attachment[];
  getConversationHistory(): ModelMessage[];
  setStepMessages(stepMessages: ModelMessage[]): void;
  /**
   * Commit the buffered step messages into the kernel-owned conversation history.
   */
  commitStepMessages(): void;
  setConversationHistory(conversationHistory: ModelMessage[]): void;
  /**
   * Replace kernel history without clearing in-progress stepMessages.
   * Safe to call mid-turn (during tool loop).
   */
  replaceKernelHistory(history: ModelMessage[]): void;
  hasConversationHistory(): boolean;
}
