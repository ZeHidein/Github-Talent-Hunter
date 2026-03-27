export { default as Agent } from '../../../vendor/agent-library/core/agent';
export { default as AgentState } from '../../../vendor/agent-library/core/agent-state';
export { AgentFactory } from '../../../vendor/agent-library/core/agent.factory';
export { AgentService } from '../../../vendor/agent-library/core/agent.service';
export type {
  AgentRunOutcome,
  AgentRunOptions,
} from '../../../vendor/agent-library/core/agent.service';
export type {
  AgentParamsT,
  AgentRunInput,
} from '../../../vendor/agent-library/core/agent';
export type {
  Attachment,
  IAgentState,
  CreateAgentParams,
} from '../../../vendor/agent-library/core/interfaces';

export {
  ContentType,
  type AgentContent,
  type TextContent,
  type AudioContent,
  type ToolContent,
  type ComponentContent,
  type ComponentStreaming,
  type ToolPartState,
  createTextContent,
  createAudioContent,
  createToolContent,
  createComponent,
  createStreamingComponent,
  createComponentResult,
  createComponentError,
  copyContent,
  toComponentProps,
  isComponentContent,
  isStreamingComponent,
  isComponentLoading,
  isComponentStreaming,
  isComponentDone,
  isStreamingDelta,
} from '../../../vendor/agent-library/types/content';

export { AgentMode } from '../../../vendor/agent-library/types/mode';
export { generateId, generateShortId } from '../../../vendor/agent-library/types/id';
export {
  AgentRetryError,
  AgentBudgetError,
} from '../../../vendor/agent-library/types/errors';
export { CancelableStream } from '../../../vendor/agent-library/types/cancelable-stream';
export { ContentStream } from '../../../vendor/agent-library/types/content-stream';
export { EventStream, type EventSink } from '../../../vendor/agent-library/types/event-stream';
export type { AgentRunHandle } from '../../../vendor/agent-library/kernel/run-handle';

export {
  ToolModel,
  type ToolType,
  type FunctionParameters,
  type ToolParameters,
  type ToolExecuteResult,
  type ToolExecuteContext,
  type ToolRunnerEvent,
  type ToolOutput,
} from '../../../vendor/agent-library/tools/tool-model';

export {
  ToolRegistry,
  type IToolRegistry,
} from '../../../vendor/agent-library/tools/tool-registry';

export type {
  KernelSnapshot,
  AgentTurnRequest,
  AgentKernelTurn,
} from '../../../vendor/agent-library/core/agent-state';
export { ToolCall } from '../../../vendor/agent-library/tools/tool-call';

export {
  ComponentToolModel,
  createComponentTool,
  isComponentTool,
  type ComponentToolConfig,
} from '../../../vendor/agent-library/tools/component-tool';

export { ToolLoopAgentRunner } from '../../../vendor/agent-library/runners/tool-loop-agent.runner';
export type {
  AgentRunner,
  AgentRunnerHandle,
  AgentRunnerRunOptions,
  AgentStreamEvent as BaseAgentStreamEvent,
} from '../../../vendor/agent-library/runners/agent-runner';

// Import the base type for extension
import type { AgentStreamEvent as BaseEvent } from '../../../vendor/agent-library/runners/agent-runner';
import type { ModelMessage } from '@ai-sdk/provider-utils';

/**
 * Extended AgentStreamEvent for server use.
 * Includes 'state-update' and 'user-message' events for session management.
 */
export type AgentStreamEvent =
  | BaseEvent
  | { type: 'state-update'; conversationHistory: ModelMessage[] }
  | { type: 'user-message'; content: string };

export {
  stopPolicy,
  retryPolicy,
  checkpointPolicy,
  turnPolicy,
  policies as defaultPolicies,
} from '../../../vendor/agent-library/defaults/policies';

export { DefaultPresenter } from '../../../vendor/agent-library/defaults/presenter';

// Processors
export { SystemPromptProcessor } from '../../../vendor/agent-library/defaults/processors/system-prompt.processor';
export { TurnInputProcessor } from '../../../vendor/agent-library/defaults/processors/turn-input.processor';

// Middlewares
export { CacheStrategyMiddleware } from '../../../vendor/agent-library/cache/middlewares/cache-strategy.middleware';
export { CacheStrategyFactory } from '../../../vendor/agent-library/cache/strategies/cache-strategy.factory';

// Telemetry
export { setLangfuseClient } from '../../../vendor/agent-library/telemetry/langfuse';
export type {
  TraceOrchestrator,
  TraceRun,
} from '../../../vendor/agent-library/telemetry/trace-orchestrator';

export type {
  ToolDefinition,
  ToolInvocationContext,
} from '../../../vendor/agent-library/kernel/tooling';
export type {
  StopPolicy,
  RetryPolicy,
  CheckpointPolicy,
  TurnPolicy,
} from '../../../vendor/agent-library/kernel/policies';
export type { KernelPresenter } from '../../../vendor/agent-library/kernel/presenter';
export { parseFrontmatter } from '../../../vendor/agent-library/util/skills';

export {
  ComponentPropsResolver,
  createComponentPropsResolver,
  type ResolvedComponentProps,
} from '../../../vendor/agent-library/kernel/utils/component-props-resolver';

// Replay buffer
export {
  MemoryReplayBuffer,
  type MemoryReplayBufferOptions,
} from '../../../vendor/agent-library/replay-buffer/memory-replay-buffer';

// State
export {
  StateConnection,
  type StateConnectionOptions,
  type IStateTransport,
  type IStateTransportAdapter,
} from '../../../vendor/agent-library/state/state-connection';

export { AgentStateStore } from '../../../vendor/agent-library/state/agent-state-store';
export { RpcStateBackend } from '../../../vendor/agent-library/state/rpc-state-backend';
export { InMemoryStateBackend } from '../../../vendor/agent-library/state/in-memory-state-backend';
export { globMatch } from '../../../vendor/agent-library/state/glob-match';
export type {
  StateChangeEvent,
  StateBackend,
  PathRule,
  Unsubscribe,
} from '../../../vendor/agent-library/state/types';

// Events
export {
  EventProcessor,
  type EventProcessorOptions,
} from '../../../vendor/agent-library/events/event-processor';

export {
  TriggerDispatcher,
  type TriggerDispatcherOptions,
} from '../../../vendor/agent-library/events/trigger-dispatcher';

export { TriggerRouter } from '../../../vendor/agent-library/events/trigger-router';

export {
  InboxReconciler,
  type InboxReconcilerOptions,
} from '../../../vendor/agent-library/events/inbox-reconciler';

export type {
  TriggerEvent,
  TriggerContext,
  TriggerHandler,
  TriggerHandlerResult,
  UnhandledTriggerCallback,
} from '../../../vendor/agent-library/events/types';
