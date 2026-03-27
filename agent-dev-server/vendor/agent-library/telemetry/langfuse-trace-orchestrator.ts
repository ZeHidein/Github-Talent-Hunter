import type { LanguageModelUsage } from 'ai';
import type {
  TraceOrchestrator,
  TraceRun,
  TraceOrchestratorModelParams,
} from './trace-orchestrator.ts';
import { getCacheReadInputTokens, getCacheWriteInputTokens } from '../util/token-usage.ts';
import { getAgentLogger } from '../types/logger.ts';

type LangfuseTrace = {
  id: string;
  update?: (params: { output?: unknown; metadata?: Record<string, unknown> }) => void;
};

type LangfuseGeneration = {
  id: string;
  update?: (params: {
    output?: unknown;
    usage?: unknown;
    usageDetails?: Record<string, number>;
    endTime?: Date;
  }) => void;
};

type LangfuseSpan = {
  update?: (params: {
    output?: unknown;
    endTime?: Date;
    level?: 'ERROR';
    statusMessage?: string;
  }) => void;
};

export type LangfuseClient = {
  trace: (params: {
    id?: string;
    name?: string;
    input?: unknown;
    userId?: string;
    metadata?: Record<string, unknown>;
  }) => LangfuseTrace;
  generation: (params: {
    id?: string;
    traceId: string;
    name?: string;
    startTime?: Date;
    endTime?: Date;
    input?: unknown;
    output?: unknown;
    model?: string;
    modelParameters?: Record<string, string | number | boolean | string[]>;
    usage?: unknown;
    usageDetails?: Record<string, number>;
    metadata?: Record<string, unknown>;
    parentObservationId?: string;
  }) => LangfuseGeneration;
  span: (params: {
    id?: string;
    traceId: string;
    name?: string;
    startTime?: Date;
    endTime?: Date;
    input?: unknown;
    output?: unknown;
    metadata?: Record<string, unknown>;
    parentObservationId?: string;
  }) => LangfuseSpan;
  flushAsync?: () => Promise<void>;
};

type LangfuseTraceOrchestratorParams = {
  client: LangfuseClient;
  getContext?: () => {
    userId?: string;
    agentId?: string;
    requestId?: string;
  } | null;
};

const safeString = (value: unknown) => {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const toModelParameters = (params?: TraceOrchestratorModelParams) => {
  if (!params) {
    return undefined;
  }
  const modelParameters: Record<string, string | number | boolean | string[]> = {};
  if (typeof params.temperature === 'number') {
    modelParameters.temperature = params.temperature;
  }
  if (typeof params.maxOutputTokens === 'number') {
    modelParameters.maxOutputTokens = params.maxOutputTokens;
  }
  if (params.providerOptions) {
    modelParameters.providerOptions = safeString(params.providerOptions);
  }
  return Object.keys(modelParameters).length > 0 ? modelParameters : undefined;
};

const toUsageBreakdown = (
  usage?: LanguageModelUsage,
): { usageSummary: Record<string, number>; usageDetails: Record<string, number> } => {
  const usageSummary: Record<string, number> = {};
  const usageDetails: Record<string, number> = {};
  if (!usage) {
    return { usageSummary, usageDetails };
  }

  if (typeof usage.inputTokens === 'number' && Number.isFinite(usage.inputTokens)) {
    usageSummary.input = usage.inputTokens;
  }
  if (typeof usage.outputTokens === 'number' && Number.isFinite(usage.outputTokens)) {
    usageSummary.output = usage.outputTokens;
  }
  if (typeof usage.totalTokens === 'number' && Number.isFinite(usage.totalTokens)) {
    usageSummary.total = usage.totalTokens;
  }

  const cacheReadTokens = getCacheReadInputTokens(usage);
  const cacheWriteTokens = getCacheWriteInputTokens(usage);

  if (cacheReadTokens > 0) {
    usageDetails.cache_read_input_tokens = cacheReadTokens;
  }
  if (cacheWriteTokens > 0) {
    usageDetails.cache_write_input_tokens = cacheWriteTokens;
  }

  const textTokens = usage.outputTokenDetails?.textTokens;
  if (typeof textTokens === 'number' && Number.isFinite(textTokens)) {
    usageDetails.output_tokens_text = textTokens;
  }

  const reasoningTokens = usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens;
  if (typeof reasoningTokens === 'number' && Number.isFinite(reasoningTokens)) {
    usageDetails.output_tokens_reasoning = reasoningTokens;
  }

  if (
    usageSummary.total === undefined &&
    typeof usageSummary.input === 'number' &&
    typeof usageSummary.output === 'number'
  ) {
    usageSummary.total = usageSummary.input + usageSummary.output;
  }

  return { usageSummary, usageDetails };
};

export class LangfuseTraceOrchestrator implements TraceOrchestrator {
  private client: LangfuseClient;
  private getContext?: LangfuseTraceOrchestratorParams['getContext'];
  private logger = getAgentLogger();

  private logFailure(phase: string, error: unknown, extra?: Record<string, unknown>) {
    this.logger.warn('[Langfuse] Trace orchestration failed', {
      phase,
      error: error instanceof Error ? error.message : String(error),
      ...extra,
    });
  }

  constructor(params: LangfuseTraceOrchestratorParams) {
    this.client = params.client;
    this.getContext = params.getContext;
  }

  startRun(params: {
    traceName: string;
    input: unknown;
    userId?: string;
    agentId?: string;
    requestId?: string;
    metadata?: Record<string, unknown>;
    model?: string | null;
    provider?: string | null;
    modelParameters?: TraceOrchestratorModelParams;
  }): TraceRun {
    const context = this.getContext?.() ?? null;
    let trace: LangfuseTrace | null = null;
    try {
      trace = this.client.trace({
        name: params.traceName,
        input: params.input,
        userId: params.userId ?? context?.userId,
        metadata: {
          agentId: params.agentId ?? context?.agentId,
          requestId: params.requestId ?? context?.requestId,
          provider: params.provider ?? undefined,
          model: params.model ?? undefined,
          modelParameters: toModelParameters(params.modelParameters),
          ...params.metadata,
        },
      });
      this.logger.info('[Langfuse] Trace created', {
        traceId: trace.id,
        traceName: params.traceName,
      });
      if (this.client.flushAsync) {
        this.client.flushAsync().catch((error) =>
          this.logger.warn('[Langfuse] Trace flush failed', {
            traceId: trace?.id,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    } catch (error) {
      this.logFailure('trace.create', error, { traceName: params.traceName });
      return {
        onModelStepStart: () => {},
        onModelStepEnd: () => {},
        onToolStart: () => {},
        onToolEnd: () => {},
        onRunEnd: () => {},
      };
    }

    const traceId = trace.id;
    const generations = new Map<number, LangfuseGeneration>();
    const toolSpans = new Map<string, LangfuseSpan>();
    let activeGenerationId: string | undefined;

    return {
      traceId,
      onModelStepStart: ({ stepIndex, input, model, provider, modelParameters }) => {
        try {
          const generation = this.client.generation({
            traceId,
            name: 'streamText',
            startTime: new Date(),
            input,
            model: model ?? undefined,
            modelParameters: toModelParameters(modelParameters),
            metadata: {
              operation: 'streamText',
              stepIndex,
              provider: provider ?? undefined,
            },
          });
          generations.set(stepIndex, generation);
          activeGenerationId = generation.id;
        } catch (error) {
          this.logFailure('generation.start', error, { traceId, stepIndex });
        }
      },
      onModelStepEnd: ({ stepIndex, output, usage }) => {
        const generation = generations.get(stepIndex);
        if (!generation) {
          return;
        }
        try {
          const { usageSummary, usageDetails } = toUsageBreakdown(usage);
          const usagePayload = Object.keys(usageSummary).length > 0 ? usageSummary : undefined;
          const usageDetailsPayload =
            Object.keys(usageDetails).length > 0 ? usageDetails : undefined;
          generation.update?.({
            output,
            usage: usagePayload,
            usageDetails: usageDetailsPayload,
            endTime: new Date(),
          });
          this.logger.info('[Langfuse] Generation completed', {
            traceId,
            generationId: generation.id,
            stepIndex,
          });
        } catch (error) {
          this.logFailure('generation.end', error, { traceId, stepIndex });
        }
      },
      onToolStart: ({ toolCallId, toolName, input }) => {
        try {
          const span = this.client.span({
            traceId,
            parentObservationId: activeGenerationId,
            name: toolName,
            startTime: new Date(),
            input,
            metadata: { toolCallId, operation: 'tool', toolName },
          });
          toolSpans.set(toolCallId, span);
          this.logger.info('[Langfuse] Tool span started', {
            traceId,
            toolCallId,
            toolName,
            parentObservationId: activeGenerationId,
          });
        } catch (error) {
          this.logFailure('tool.start', error, { traceId, toolCallId, toolName });
        }
      },
      onToolEnd: ({ toolCallId, output, error }) => {
        const span = toolSpans.get(toolCallId);
        if (!span) {
          return;
        }
        try {
          span.update?.({
            output: error ? safeString(error) : output,
            endTime: new Date(),
            level: error ? 'ERROR' : undefined,
            statusMessage: error ? safeString(error) : undefined,
          });
        } catch (error) {
          this.logFailure('tool.end', error, { traceId, toolCallId });
        }
      },
      onRunEnd: ({ status, output, error, conversationHistory }) => {
        try {
          trace.update?.({
            output: status === 'ok' ? output : undefined,
            metadata: {
              status,
              error: error ? safeString(error) : undefined,
              conversationHistory,
            },
          });
        } catch (updateError) {
          this.logFailure('trace.update', updateError, { traceId, status });
        }
      },
      flush: async () => {
        if (!this.client.flushAsync) {
          this.logger.warn('[Langfuse] Flush is unavailable', { traceId });
          return;
        }
        try {
          await this.client.flushAsync();
        } catch (error) {
          this.logger.warn('[Langfuse] Flush failed', {
            traceId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    };
  }
}
