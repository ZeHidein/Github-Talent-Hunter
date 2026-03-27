import type AgentState from '../bl/agent/agent-state';
import BaseError from './base-error';

export default class RetryError extends BaseError {
  private static message = 'RetryError occurred';
  private state: AgentState;

  constructor(state: AgentState) {
    super(`${RetryError.message}\n${state.getError()}`);
    this.state = state;
    Object.setPrototypeOf(this, RetryError.prototype);
  }

  getState() {
    return this.state;
  }
}
