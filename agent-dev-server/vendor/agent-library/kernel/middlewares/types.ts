import type { LanguageModelMiddleware } from 'ai';
import type AgentState from '../../core/agent-state';

export type KernelModelMiddlewareContext = {
  state: AgentState;
};

export interface KernelModelMiddleware {
  create(
    ctx: KernelModelMiddlewareContext,
  ): LanguageModelMiddleware | LanguageModelMiddleware[] | null;
}
