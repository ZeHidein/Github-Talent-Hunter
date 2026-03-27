import type AgentState from '../core/agent-state.ts';
import type { AgentRunOutcome } from '../core/agent.service.ts';
import type { UiSink } from './ui-sink.ts';

export type KernelCheckpoint = {
  history: unknown;
  checklist: unknown;
  responseId: string;
};

export interface KernelPresenter {
  emitCheckpoint(params: { sink: UiSink; state: AgentState }): void;

  /**
   * Generic helper for emitting a UI component.
   * This keeps component-wiring (messageId/responseId) inside the presenter layer.
   */
  emitComponent(params: {
    sink: UiSink;
    state: AgentState;
    componentName: string;
    props: Record<string, unknown>;
  }): void;

  emitExecutionLimit(params: { sink: UiSink; state: AgentState; maxExecutions: number }): void;

  emitRetryNotice(params: { sink: UiSink; state: AgentState; message: string }): void;

  emitTerminalMessage(params: { sink: UiSink; state: AgentState; message: string }): void;

  onTurnEnd?(params: { sink: UiSink; state: AgentState; outcome: AgentRunOutcome }): void;
}
