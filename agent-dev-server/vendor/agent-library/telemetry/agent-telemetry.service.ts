import type { LanguageModelUsage } from 'ai';
import { getAgentLogger } from '../types/logger.ts';
import { isAgentTracerBundle, type AgentTracer, type AgentTracerBundle } from '../types/tracer.ts';

export type TelemetrySettings = {
  isEnabled?: boolean;
  recordInputs?: boolean;
  recordOutputs?: boolean;
  functionId?: string;
  metadata?: Record<string, unknown>;
  tracer?: AgentTracer;
};

export type AgentTelemetryRun = {
  traceId: string;
  experimentalTelemetry: TelemetrySettings;
  recordUsage: (usage: LanguageModelUsage) => void;
  setTotalUsage: (usage: LanguageModelUsage) => void;
  recordOutput: (output: unknown) => void;
  recordError: (error: unknown) => void;
  endRun: (options?: { stopReason?: string }) => void;
  withActiveSpan: <T>(fn: () => Promise<T> | T) => Promise<T>;
  bindAsyncIterable: <T>(iterable: AsyncIterable<T>) => AsyncIterable<T>;
  recordObservationInput: (input: unknown) => void;
  recordObservationOutput: (output: unknown) => void;
  enrichTrace: (data: {
    input?: unknown;
    output?: unknown;
    metadata?: Record<string, unknown>;
    userId?: string;
    sessionId?: string;
  }) => void;
  /**
   * Get the collected trace data for external enrichment.
   * This allows the server to update the trace via Langfuse SDK.
   */
  getTraceData: () => {
    traceId: string;
    traceName: string;
    input: unknown;
    output: unknown;
    usage: LanguageModelUsage | undefined;
    metadata: Record<string, unknown> | undefined;
  };
};

export class AgentTelemetryService {
  private readonly tracerBundle: AgentTracerBundle | null;
  private readonly otelTracer: unknown | null;
  private readonly traceName: string;
  private readonly recordInputs: boolean;
  private readonly recordOutputs: boolean;
  private readonly metadata?: Record<string, unknown>;
  private readonly input?: unknown;
  private readonly logger = getAgentLogger();

  constructor(params: {
    tracer: AgentTracer | null;
    traceName: string;
    input?: unknown;
    modelName?: string;
    recordInputs?: boolean;
    recordOutputs?: boolean;
    metadata?: Record<string, unknown>;
  }) {
    this.tracerBundle = isAgentTracerBundle(params.tracer) ? params.tracer : null;
    this.otelTracer = this.tracerBundle ? this.tracerBundle.tracer : params.tracer;
    this.traceName = params.traceName;
    this.recordInputs = params.recordInputs ?? true;
    this.recordOutputs = params.recordOutputs ?? true;
    this.metadata = params.metadata;
    this.input = params.input;
  }

  startRun(): AgentTelemetryRun {
    let capturedTraceId = 'unknown';
    let lastOutput: unknown;
    let lastUsage: LanguageModelUsage | undefined;
    let hasEnded = false;
    let lastActiveSpan: unknown | null = null;
    let lastGenerationSpan: unknown | null = null;

    const toAttributeValue = (value: unknown): string | number | boolean | undefined => {
      if (value === undefined) {
        return undefined;
      }
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
      }
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    };

    const setSpanAttributes = (span: unknown, attributes: Record<string, unknown>) => {
      if (!span || typeof span !== 'object') {
        return;
      }
      const spanWithAttributes = span as {
        setAttributes?: (attrs: Record<string, unknown>) => void;
        setAttribute?: (key: string, value: unknown) => void;
      };
      if (typeof spanWithAttributes.setAttributes === 'function') {
        spanWithAttributes.setAttributes(attributes);
        return;
      }
      if (typeof spanWithAttributes.setAttribute === 'function') {
        for (const [key, value] of Object.entries(attributes)) {
          if (value !== undefined) {
            spanWithAttributes.setAttribute(key, value);
          }
        }
      }
    };

    const getActiveSpan = (): unknown | null => {
      if (!this.tracerBundle) {
        return null;
      }
      try {
        return this.tracerBundle.trace.getSpan(this.tracerBundle.context.active()) ?? null;
      } catch {
        return null;
      }
    };

    const trackSpan = (span: unknown) => {
      if (!span || typeof span !== 'object') {
        return;
      }
      lastActiveSpan = span;
      const spanName = (span as { name?: string }).name;
      if (spanName?.includes('ai.streamText')) {
        lastGenerationSpan = span;
        const serializedInput = toAttributeValue(this.input);
        setSpanAttributes(span, {
          'langfuse.observation.input': serializedInput,
          'gen_ai.prompt': serializedInput,
          'input.value': serializedInput,
          'ai.prompt.messages': serializedInput,
          'langfuse.trace.input': this.recordInputs ? serializedInput : undefined,
          'langfuse.trace.name': this.traceName,
        });
      }
    };

    const wrapTracer = (tracer: unknown): unknown => {
      if (!tracer || typeof tracer !== 'object') {
        return tracer;
      }
      const base = tracer as {
        startSpan?: (...args: unknown[]) => unknown;
        startActiveSpan?: (...args: unknown[]) => unknown;
      };
      return {
        ...base,
        startSpan: (...args: unknown[]) => {
          const span = base.startSpan?.(...args);
          trackSpan(span);
          return span;
        },
        startActiveSpan: (...args: unknown[]) => {
          const span = base.startActiveSpan?.(...args);
          trackSpan(span);
          return span;
        },
      };
    };

    const experimentalTelemetry: TelemetrySettings = {
      isEnabled: !!this.otelTracer,
      tracer: this.otelTracer ? wrapTracer(this.otelTracer) : undefined,
      recordInputs: this.recordInputs,
      recordOutputs: this.recordOutputs,
      metadata: this.metadata,
    };

    // Try to capture trace ID from active span
    const captureTraceId = () => {
      if (capturedTraceId !== 'unknown') {
        return;
      }
      if (!this.tracerBundle) {
        return;
      }

      try {
        const { context, trace } = this.tracerBundle;
        const activeSpan = trace.getSpan(context.active());
        if (activeSpan && typeof activeSpan === 'object' && 'spanContext' in activeSpan) {
          const spanContext = (
            activeSpan as { spanContext: () => { traceId?: string } }
          ).spanContext();
          if (spanContext?.traceId) {
            capturedTraceId = spanContext.traceId;
          }
        }
        if (
          capturedTraceId === 'unknown' &&
          lastGenerationSpan &&
          typeof lastGenerationSpan === 'object' &&
          'spanContext' in lastGenerationSpan
        ) {
          const spanContext = (
            lastGenerationSpan as { spanContext: () => { traceId?: string } }
          ).spanContext();
          if (spanContext?.traceId) {
            capturedTraceId = spanContext.traceId;
          }
        }
      } catch {
        // Ignore errors in trace ID capture
      }
    };

    const recordUsage = (usage: LanguageModelUsage) => {
      lastUsage = usage;
    };

    const setTotalUsage = (usage: LanguageModelUsage) => {
      lastUsage = usage;
    };

    const recordOutput = (output: unknown) => {
      lastOutput = output;
    };

    const recordError = (_error: unknown) => {
      // Errors are recorded by AI SDK on its spans
    };

    const enrichTrace = (_data: {
      input?: unknown;
      output?: unknown;
      metadata?: Record<string, unknown>;
      userId?: string;
      sessionId?: string;
    }) => {
      // Enrichment will be done via getTraceData() + Langfuse SDK
    };

    const endRun = (_options?: { stopReason?: string }) => {
      if (hasEnded) {
        return;
      }
      hasEnded = true;
    };

    // AI SDK handles span creation - we just capture the trace ID
    const withActiveSpan = async <T>(fn: () => Promise<T> | T): Promise<T> => {
      const result = await fn();
      // Try to capture trace ID after AI SDK has created its span
      captureTraceId();
      return result;
    };

    // Capture trace ID during iteration as well
    const bindAsyncIterable = <T>(iterable: AsyncIterable<T>): AsyncIterable<T> => {
      const iterator = iterable[Symbol.asyncIterator]();

      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              captureTraceId();
              const maybeSpan = getActiveSpan();
              if (maybeSpan) {
                lastActiveSpan = maybeSpan;
              }
              return iterator.next();
            },
            return: (value?: unknown) =>
              iterator.return
                ? iterator.return(value as T)
                : Promise.resolve({ done: true as const, value: value as T }),
            throw: (error?: unknown) =>
              iterator.throw ? iterator.throw(error) : Promise.reject(error),
          };
        },
      };
    };

    const getTraceData = () => ({
      traceId: capturedTraceId,
      traceName: this.traceName,
      input: this.recordInputs ? this.input : undefined,
      output: this.recordOutputs ? lastOutput : undefined,
      usage: lastUsage,
      metadata: this.metadata,
    });

    const recordObservationInput = (input: unknown) => {
      const span = getActiveSpan() ?? lastActiveSpan ?? lastGenerationSpan;
      if (!span) {
        this.logger.warn('[Telemetry] No active span for observation input');
        return;
      }
      const serializedInput = toAttributeValue(input);
      setSpanAttributes(span, {
        'langfuse.observation.input': serializedInput,
        'gen_ai.prompt': serializedInput,
        'input.value': serializedInput,
        'ai.prompt.messages': serializedInput,
        'langfuse.trace.input': this.recordInputs ? serializedInput : undefined,
        'langfuse.trace.name': this.traceName,
      });
      try {
        const spanContext = (span as { spanContext?: () => { traceId?: string } }).spanContext?.();
        this.logger.info('[Telemetry] Recorded observation input', {
          traceId: spanContext?.traceId,
        });
      } catch {
        // Ignore spanContext errors
      }
    };

    const recordObservationOutput = (output: unknown) => {
      const span = getActiveSpan() ?? lastActiveSpan ?? lastGenerationSpan;
      if (!span) {
        this.logger.warn('[Telemetry] No active span for observation output');
        return;
      }
      const serializedOutput = toAttributeValue(output);
      setSpanAttributes(span, {
        'langfuse.observation.output': serializedOutput,
        'gen_ai.completion': serializedOutput,
        'output.value': serializedOutput,
        'ai.response.text': serializedOutput,
        'langfuse.trace.output': this.recordOutputs ? serializedOutput : undefined,
      });
      try {
        const spanContext = (span as { spanContext?: () => { traceId?: string } }).spanContext?.();
        this.logger.info('[Telemetry] Recorded observation output', {
          traceId: spanContext?.traceId,
        });
      } catch {
        // Ignore spanContext errors
      }
    };

    const run: AgentTelemetryRun = {
      get traceId() {
        return capturedTraceId;
      },
      experimentalTelemetry,
      recordUsage,
      setTotalUsage,
      recordOutput,
      recordError,
      endRun,
      withActiveSpan,
      bindAsyncIterable,
      recordObservationInput,
      recordObservationOutput,
      enrichTrace,
      getTraceData,
    };

    return run;
  }
}
