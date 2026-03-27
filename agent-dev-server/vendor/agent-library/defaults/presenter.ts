import { createTextContent, createComponent, createToolContent } from '../types/content.ts';
import { generateShortId } from '../types/id.ts';
import type AgentState from '../core/agent-state.ts';
import type { KernelPresenter } from '../kernel/presenter.ts';
import type { UiSink } from '../kernel/ui-sink.ts';

/**
 * Default presenter implementation for the agent runtime library.
 * Delegates UI emission responsibilities without coupling to application state.
 */
export class DefaultPresenter implements KernelPresenter {
  private opts?: {
    getCheckpointExtras?: (state: AgentState) => Record<string, unknown>;
  };

  constructor(opts?: { getCheckpointExtras?: (state: AgentState) => Record<string, unknown> }) {
    this.opts = opts;
  }

  emitCheckpoint(params: { sink: UiSink; state: AgentState }): void {
    const currentHistory = params.state.getConversationHistory();
    const extras = this.opts?.getCheckpointExtras?.(params.state) ?? {};
    params.sink.append(
      createToolContent({
        messageId: generateShortId(4),
        responseId: params.state.getResponseId(),
        tool: { name: 'StateUpdate' },
        content: {
          conversationHistory: currentHistory,
          lastResponseId: null,
          ...extras,
        },
      }),
    );
  }

  emitComponent(params: {
    sink: UiSink;
    state: AgentState;
    componentName: string;
    props: Record<string, unknown>;
  }): void {
    params.sink.append(
      createComponent({
        messageId: generateShortId(4),
        responseId: params.state.getResponseId(),
        componentName: params.componentName,
        props: params.props,
      }),
    );
  }

  emitExecutionLimit(params: { sink: UiSink; state: AgentState; maxExecutions: number }): void {
    params.sink.append(
      createComponent({
        messageId: generateShortId(4),
        responseId: params.state.getResponseId(),
        componentName: 'OneIterationExecutionLimit',
        props: { maxExecutions: params.maxExecutions },
      }),
    );
  }

  emitRetryNotice(params: { sink: UiSink; state: AgentState; message: string }): void {
    params.sink.append(
      createTextContent({
        messageId: generateShortId(4),
        responseId: params.state.getResponseId(),
        content: params.message,
      }),
    );
  }

  emitTerminalMessage(params: { sink: UiSink; state: AgentState; message: string }): void {
    params.sink.append(
      createTextContent({
        messageId: generateShortId(4),
        responseId: params.state.getResponseId(),
        content: params.message,
      }),
    );
  }
}
