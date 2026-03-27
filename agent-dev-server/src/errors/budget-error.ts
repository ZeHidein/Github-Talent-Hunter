import type AgentState from '../bl/agent/agent-state';
import BaseError from './base-error';

export default class BudgetError extends BaseError {
  private static message = 'BudgetError occurred';
  private state: AgentState;

  tokens: number;
  maxTokens: number;

  constructor(state: AgentState, tokens: number, maxTokens: number) {
    super(`${BudgetError.message}\n${state.getError()}`);
    this.state = state;
    this.tokens = tokens;
    this.maxTokens = maxTokens;
    Object.setPrototypeOf(this, BudgetError.prototype);
  }

  getState() {
    return this.state;
  }
}
