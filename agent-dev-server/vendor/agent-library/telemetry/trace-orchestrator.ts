import type { LanguageModelUsage } from 'ai';

export type TraceOrchestratorModelParams = {
  temperature?: number;
  maxOutputTokens?: number;
  providerOptions?: Record<string, unknown>;
};

export type TraceRunStartParams = {
  traceName: string;
  input: unknown;
  userId?: string;
  agentId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
  model?: string | null;
  provider?: string | null;
  modelParameters?: TraceOrchestratorModelParams;
};

export type TraceRun = {
  traceId?: string;
  onModelStepStart: (params: {
    stepIndex: number;
    input: unknown;
    model?: string | null;
    provider?: string | null;
    modelParameters?: TraceOrchestratorModelParams;
  }) => void;
  onModelStepEnd: (params: {
    stepIndex: number;
    output?: unknown;
    usage?: LanguageModelUsage;
  }) => void;
  onToolStart: (params: { toolCallId: string; toolName: string; input?: unknown }) => void;
  onToolEnd: (params: { toolCallId: string; output?: unknown; error?: unknown }) => void;
  onRunEnd: (params: {
    status: 'ok' | 'error' | 'aborted';
    output?: unknown;
    error?: unknown;
    conversationHistory?: unknown;
  }) => void;
  flush?: () => Promise<void>;
};

export type TraceOrchestrator = {
  startRun: (params: TraceRunStartParams) => TraceRun;
};
