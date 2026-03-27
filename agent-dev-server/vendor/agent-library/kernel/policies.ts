import type { AgentMode } from '../types/mode.ts';
import type { IToolRegistry } from '../tools/tool-registry.ts';
import type AgentState from '../core/agent-state.ts';
import type { AgentRunOutcome } from '../core/agent.service.ts';
import type { UiSink } from './ui-sink.ts';
import type { KernelPresenter } from './presenter.ts';

export type StopPolicy = (params: { agentMode: AgentMode; toolRegistry: IToolRegistry }) => {
  stopAtToolNames?: string[];
};

export type TurnPolicy = (params: {
  phase: 'turn-end';
  agentMode: AgentMode;
  state: AgentState;
  outcome: AgentRunOutcome;
  sink: UiSink;
  presenter: KernelPresenter;
}) => Promise<{ shouldStop: boolean }>;

export type RetryPolicy = (params: {
  error: unknown;
  state: AgentState;
  retries: number;
  maxRetries: number;
}) => { shouldRetry: boolean; delayMs: number; userMessage?: string; triggerTruncation?: boolean };

export type CheckpointPolicy = (params: {
  phase: 'tool' | 'turn-end' | 'abort' | 'error';
  lastRun: AgentRunOutcome | null;
}) => { shouldEmitStateUpdate: boolean };
