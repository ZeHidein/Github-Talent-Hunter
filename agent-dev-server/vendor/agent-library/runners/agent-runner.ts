/**
 * AgentRunner
 *
 * Framework seam between `AgentService` and nothing more for now
 *
 * Requirements for implementations:
 * - expose an async stream of `AgentStreamEvent` events
 * - provide a `done` promise that settles when streaming is complete
 * - never depend on `ActionAgent` / UI types; emit only `AgentStreamEvent`
 *
 * `AgentService` owns turning these events into UI stream content and executing server tools.
 */
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ModelMessage, ProviderOptions } from '@ai-sdk/provider-utils';
import type { ToolDefinition } from '../kernel';
import type { Tool } from 'ai';
import type { ZodType } from 'zod';
import type AgentState from '../core/agent-state';

export type AgentStreamEvent =
  | { type: 'text-delta'; messageId: string; textDelta: string }
  | { type: 'reasoning-delta'; messageId: string; textDelta: string }
  | { type: 'model-step-start'; stepIndex: number }
  | { type: 'model-step-end'; stepIndex: number; usage?: import('ai').LanguageModelUsage }
  | { type: 'tool-input-start'; toolCallId: string; toolName: string }
  | { type: 'tool-input-delta'; toolCallId: string; delta: string }
  | { type: 'tool-input-end'; toolCallId: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown }
  | { type: 'tool-error'; toolCallId: string; toolName: string; error: unknown }
  | { type: 'stream-error'; error: unknown }
  | { type: 'finish' };

export type AgentRunnerToolExecutor = (params: {
  toolName: string;
  toolCallId: string;
  input: unknown;
  rawArgs: string;
}) => Promise<unknown>;

export interface AgentRunnerRunOptions {
  model: LanguageModelV3;
  instructions: string;
  messages: ModelMessage[];
  tools: ToolDefinition[];
  /**
   * Provider-native AI SDK tools (e.g. Anthropic text editor / web search).
   *
   * Important: AI SDK tools do not carry a `name` property; the tool name is the key in this record.
   */
  aiSdkToolset?: Record<string, Tool<unknown, unknown>>;
  /**
   * @deprecated Prefer `aiSdkToolset` so tool names are not lost.
   */
  aiSdkTools?: Array<Tool<unknown, unknown>>;
  stopAtToolNames?: string[];
  maxSteps: number;
  abortSignal: AbortSignal;
  executeTool: AgentRunnerToolExecutor;
  onEnd?: () => void;
  onStepMessages?: (stepMessages: ModelMessage[]) => void;
  structuredOutputSchema?: ZodType<unknown>;
  modelSettings?: {
    temperature?: number;
    maxOutputTokens?: number;
    providerOptions?: ProviderOptions;
  };
  /**
   * Kernel/application state for this run. The runner may attach framework-specific
   * internal state to it
   */
  appState: AgentState;
}

export interface AgentRunnerHandle {
  events: AsyncIterable<AgentStreamEvent>;
  done: Promise<{ structuredOutput?: unknown; stopReason?: 'max-steps' }>;
  /**
   * Root trace id for this run (when tracing is enabled).
   */
  traceId?: string;
}

export interface AgentRunner {
  runStream(options: AgentRunnerRunOptions): Promise<AgentRunnerHandle>;
}
