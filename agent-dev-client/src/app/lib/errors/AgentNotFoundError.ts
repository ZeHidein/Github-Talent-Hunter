export class AgentNotFoundError extends Error {
  constructor() {
    super('Agent not found');
    this.name = 'AgentNotFoundError';
    Object.setPrototypeOf(this, AgentNotFoundError.prototype);
  }
}
