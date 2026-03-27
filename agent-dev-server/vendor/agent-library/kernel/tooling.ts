export type ToolKind = 'function' | 'web_search' | 'image_generation' | 'mcp';

export type ToolDefinition = {
  name: string;
  description?: string;
  parameters: any;
  strict?: boolean;
  kind: ToolKind;
  mcp?: {
    serverLabel: string;
    serverUrl: string;
    headers?: Record<string, string>;
  };
};

export type ToolCallContext = {
  callId: string;
  toolName: string;
  rawArgs: string;
  parsedArgs: unknown;
  metadata?: Record<string, unknown>;
};

export type RunnerContext<State = unknown> = {
  state: State;
  abortSignal?: AbortSignal;
  workflowName?: string;
  traceMetadata?: Record<string, string>;
};

export type ToolInvocationContext<State = unknown> = {
  runner: RunnerContext<State>;
  toolCall: ToolCallContext;
};
