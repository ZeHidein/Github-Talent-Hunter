export class AgentRetryError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'AgentRetryError';
  }
}

export class AgentBudgetError extends Error {
  constructor(
    message: string,
    public readonly budgetType: 'tokens' | 'turns' | 'time',
  ) {
    super(message);
    this.name = 'AgentBudgetError';
  }
}
