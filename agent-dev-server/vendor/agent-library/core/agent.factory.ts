import Agent from './agent';
import AgentState from './agent-state';
import type { CreateAgent } from './create-agent';
import type { CreateAgentParams } from './interfaces';
import type { AgentRunner } from '../runners/agent-runner';
import type { KernelPresenter } from '../kernel/presenter';
import type { CheckpointPolicy, RetryPolicy, StopPolicy, TurnPolicy } from '../kernel/policies';
import type { AgentRunOutcome } from './agent.service';
import type { TraceOrchestrator } from '../telemetry/trace-orchestrator.ts';

type AgentFactoryDeps = {
  runner: AgentRunner;
  presenter: KernelPresenter;
  policies: {
    stop: StopPolicy;
    retry: RetryPolicy;
    checkpoint: CheckpointPolicy;
    turn: TurnPolicy;
  };
  onComplete?: (args: { state: AgentState; outcome: AgentRunOutcome }) => void | Promise<void>;
  traceOrchestrator?: TraceOrchestrator;
};

/**
 * Composition-root friendly factory.
 *
 * Keeps DI clean (instantiate a class) while still allowing call-sites that expect `CreateAgent`
 * (a plain function) to work via `.createAgent`.
 */
export class AgentFactory {
  constructor(private deps: AgentFactoryDeps) {}

  create(params: CreateAgentParams): Agent {
    const { state: stateRequest, traceName, systemInstruction, ...agentParams } = params;
    const state = stateRequest
      ? AgentState.createTurn(stateRequest)
      : AgentState.createTurn({ kernel: { conversationHistory: [] } });

    return new Agent({
      ...agentParams,
      systemInstruction,
      state,
      traceName,
      runner: this.deps.runner,
      presenter: this.deps.presenter,
      policies: this.deps.policies,
      onComplete: this.deps.onComplete,
      traceOrchestrator: this.deps.traceOrchestrator,
    });
  }

  /**
   * Bound function form for code that expects `CreateAgent`.
   */
  get createAgent(): CreateAgent {
    return this.create.bind(this);
  }
}
