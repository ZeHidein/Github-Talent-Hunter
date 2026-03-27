import AgentState from '../core/agent-state.ts';

export function requireAgentState<TFrameworkState = unknown>(
  state: unknown,
): AgentState<TFrameworkState> {
  if (!(state instanceof AgentState)) {
    throw new Error('ToolInvocationContext.runner.state is not an AgentState');
  }
  return state as AgentState<TFrameworkState>;
}
