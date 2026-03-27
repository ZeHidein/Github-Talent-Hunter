import { parse } from 'best-effort-json-parser';
import type { z } from 'zod';
import type { Tool as AiSdkTool } from 'ai';
import type { ToolCall } from './tool-call.ts';
import type { UiSink } from '../kernel/ui-sink.ts';
import type { ToolDefinition, ToolInvocationContext, ToolKind } from '../kernel/tooling.ts';

// Re-export from types for backward compatibility
export type { ToolOutput, ToolOutputImage, ToolOutputFileContent } from '../types/tool-output.ts';
import type { ToolOutput } from '../types/tool-output.ts';

export type ToolType = 'function' | 'web_search' | 'image_generation' | 'mcp';

/**
 * Type for tool parameters.
 * Supports both Zod schemas and AI SDK FlexibleSchema.
 */
export type ToolParameters = z.ZodTypeAny | { _type: any };

export type ToolRunnerEvent =
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown }
  | { type: 'tool-error'; toolCallId: string; toolName: string; error: unknown };

/**
 * Result returned by the new execute() API.
 */
export interface ToolExecuteResult {
  /**
   * Tool output returned to the LLM.
   * Can be:
   * - string: Text output
   * - ToolOutputImage: Binary image data that the LLM can process visually
   * - ToolOutputFileContent: Binary file data for LLM processing
   */
  output: ToolOutput;
  /** Extra props for UI rendering (e.g., previousContent, newContent) */
  uiProps?: Record<string, unknown>;
}

/**
 * Context passed to the execute() method.
 * Simplified from ToolInvocationContext - no contentStream access.
 */
export interface ToolExecuteContext {
  /** Agent runner state (for accessing app state) */
  runner: ToolInvocationContext<unknown>['runner'];
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** Unique identifier for this tool call */
  toolCallId: string;
  /** Emit intermediate UI prop updates during execution (output-pending state). */
  onProgress?: (props: Record<string, unknown>) => void;
}

const defaultParsingFn = (args: string): unknown => {
  try {
    return parse(args);
  } catch {
    return null;
  }
};

export type FunctionParameters = Record<string, unknown>;

export class ToolModel<TParams = any> {
  readonly name: string;
  readonly description: string;
  readonly parametersSchema: ToolParameters;
  readonly toolType: ToolType;
  readonly parsingFn: (args: string) => unknown;
  public readonly isStrict: boolean;
  public readonly isStreaming: boolean;
  public readonly requiresAgenticFeedback: boolean;

  constructor(config: {
    toolType: ToolType;
    name: string;
    description?: string;
    parametersSchema: ToolParameters;
    isStrict?: boolean;
    isStreaming?: boolean;
    requiresAgenticFeedback?: boolean;
    parsingFn?: (args: string) => unknown;
  }) {
    this.name = config.name;
    this.description = config.description ?? '';
    this.parametersSchema = config.parametersSchema;
    this.toolType = config.toolType;
    this.parsingFn = config.parsingFn ?? defaultParsingFn;
    this.isStrict = config.isStrict ?? false;
    this.isStreaming = config.isStreaming ?? false;
    this.requiresAgenticFeedback = config.requiresAgenticFeedback ?? false;
  }

  getName(): string {
    return this.name;
  }

  getDescription(): string {
    return this.description;
  }

  getParametersSchema(): ToolParameters {
    return this.parametersSchema;
  }

  /**
   * Deprecated legacy shape for older OpenAI direct-call integrations.
   * New code should use `getParametersSchema()`.
   */
  getParameters(): FunctionParameters {
    return {};
  }

  getToolType(): ToolType {
    return this.toolType;
  }

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parametersSchema as any,
      strict: this.isStrict,
      kind: this.toolType as ToolKind,
    };
  }

  getAiSdkTool(): AiSdkTool<unknown, unknown> | null {
    return null;
  }

  getParsingFn(): (args: string) => unknown {
    return this.parsingFn;
  }

  onRunnerToolEvent(
    _event: ToolRunnerEvent,
    _ui: UiSink,
    _ctx: ToolInvocationContext<unknown>,
  ): void {
    // no-op by default
  }

  /**
   * Main execution method for the tool (legacy API).
   * Receives full agent context including the actual UI content stream.
   *
   * @deprecated New tools should implement execute() instead.
   * The kernel will automatically manage the ToolPart state machine.
   *
   * Tools implementing execute() do not need to implement call() -
   * the default implementation throws an error.
   */
  call(
    toolCall: ToolCall<TParams>,
    ui: UiSink,
    ctx: ToolInvocationContext<unknown>,
  ): Promise<unknown> {
    throw new Error(`${this.name} uses execute() API. call() should not be invoked directly.`);
  }

  /**
   * Simplified execution method (new API).
   *
   * When implemented, the kernel manages the ToolPart state machine:
   * - input-streaming: Kernel emits deltas as LLM generates args
   * - input-available: Kernel emits when args are complete
   * - output-pending: Kernel emits before calling execute()
   * - output-available/output-error: Kernel emits based on execute() result
   *
   * Tools implementing execute() should NOT call contentStream.append().
   *
   * @param input - Parsed and validated tool arguments
   * @param ctx - Simplified execution context
   * @returns Result with output string and optional UI props
   */
  execute?(input: TParams, ctx: ToolExecuteContext): Promise<ToolExecuteResult>;

  /**
   * Check if this tool uses the new execute() API.
   */
  hasExecute(): boolean {
    return typeof this.execute === 'function';
  }

  /**
   * Get the UI component name for this tool.
   * Override in component tools to specify which component to render.
   * Returns null for non-component tools.
   */
  getComponentName(): string | null {
    return null;
  }

  /**
   * Check if this is a component tool (renders UI).
   */
  isComponentTool(): boolean {
    return this.getComponentName() !== null;
  }
}
