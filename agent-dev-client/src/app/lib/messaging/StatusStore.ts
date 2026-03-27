import { observable, computed, action } from 'mobx';
import { ContentType, type ComponentContent, type ToolPartState } from '@/lib/agent-library';
import type { AgentStreamContent } from '@/app/lib/services/websocket-client.types';

export type StatusPhase = 'idle' | 'thinking' | 'tool-active';

/**
 * StatusStore — event-driven state machine for agent activity status.
 *
 * Subscribes directly to the content stream and derives display text
 * from its own phase.  Fully independent of MessagesStore.
 *
 * State machine:
 *   idle ──onRequestStarted──► thinking
 *   thinking ──tool input-streaming──► tool-active
 *   tool-active ──tool input-streaming / output-pending──► tool-active
 *   tool-active ──tool output-available / output-error──► thinking
 *   tool-active ──non-tool content──► thinking
 *   thinking / tool-active ──finish / error──► idle
 */
export class StatusStore {
  @observable accessor phase: StatusPhase = 'idle';
  @observable accessor activeToolName: string | null = null;

  private unsubscribe: (() => void) | null = null;

  @computed
  get text(): string | null {
    switch (this.phase) {
      case 'idle':
        return null;
      case 'thinking':
        return 'Thinking...';
      case 'tool-active':
        return `Calling ${this.activeToolName} tool...`;
      default:
        return null;
    }
  }

  /** Subscribe to a content stream (call once during init). */
  subscribe(onContent: (handler: (c: AgentStreamContent) => void) => () => void): void {
    this.unsubscribe?.();
    this.unsubscribe = onContent((content) => this.processContent(content));
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  @action.bound
  onRequestStarted(): void {
    this.phase = 'thinking';
    this.activeToolName = null;
  }

  @action.bound
  clear(): void {
    this.phase = 'idle';
    this.activeToolName = null;
  }

  @action.bound
  private processContent(content: AgentStreamContent): void {
    if (content.type === 'finish' || content.type === 'error') {
      this.phase = 'idle';
      this.activeToolName = null;
      return;
    }

    if (content.type === ContentType.Component) {
      const streaming = (content as ComponentContent).streaming;
      if (streaming?.toolName && streaming.state) {
        this.handleToolContent(streaming.toolName, streaming.state);
        return;
      }
    }

    if (this.phase === 'tool-active') {
      this.phase = 'thinking';
    }
  }

  @action.bound
  private handleToolContent(toolName: string, state: ToolPartState): void {
    if (state === 'input-streaming' || state === 'output-pending') {
      this.phase = 'tool-active';
      this.activeToolName = toolName;
    } else if (this.phase === 'tool-active') {
      this.phase = 'thinking';
    }
  }
}
