export type AgentTracerContextApi = {
  active: () => unknown;
  with: <T>(ctx: unknown, fn: () => T) => T;
};

export type AgentTracerTraceApi = {
  setSpan: (ctx: unknown, span: unknown) => unknown;
  getSpan: (ctx: unknown) => unknown | undefined;
};

/**
 * Host-provided tracing bundle.
 *
 * IMPORTANT: `context` and `trace` must come from the same OpenTelemetry API singleton
 * that created `tracer`, otherwise context propagation will not work and spans will
 * end up in separate traces.
 */
export type AgentTracerBundle = {
  tracer: unknown;
  context: AgentTracerContextApi;
  trace: AgentTracerTraceApi;
};

export type AgentTracer = unknown | AgentTracerBundle;

export function isAgentTracerBundle(value: unknown): value is AgentTracerBundle {
  return (
    !!value &&
    typeof value === 'object' &&
    'tracer' in value &&
    'context' in value &&
    'trace' in value
  );
}

let globalTracer: AgentTracer | null = null;

export function setAgentTracer(tracer: AgentTracer | null): void {
  globalTracer = tracer;
}

export function getAgentTracer(): AgentTracer | null {
  return globalTracer;
}
