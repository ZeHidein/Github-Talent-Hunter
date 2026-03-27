import type { AgentRunOutcome } from '../core/agent.service.ts';
import type { AgentMode } from '../types/mode.ts';

export type AgentKernelEvent =
  | { type: 'run-start'; agentMode: AgentMode }
  | { type: 'turn-start'; turnIndex: number }
  | { type: 'turn-end'; turnIndex: number; outcome: AgentRunOutcome }
  | { type: 'stop-by-tool'; toolName: string; agentMode: AgentMode }
  | { type: 'error'; error: unknown }
  | { type: 'retry-scheduled'; delayMs: number };

export type AgentKernelEventSink = (ev: AgentKernelEvent) => void;
