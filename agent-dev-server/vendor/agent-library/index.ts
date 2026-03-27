/**
 * @agentplace/agent - Agent Runtime Library
 *
 * A library for building AI agents with streaming, tools, and UI integration.
 * Inspired by Vercel AI SDK patterns.
 *
 * @example
 * ```typescript
 * import { createComponentTool, Agent, AgentState } from '@agentplace/agent';
 * import { z } from 'zod';
 *
 * const weatherTool = createComponentTool({
 *   name: 'ShowWeather',
 *   description: 'Display weather information',
 *   schema: z.object({ city: z.string() }),
 *   componentName: 'WeatherCard',
 * });
 * ```
 */

// =============================================================================
// Core
// =============================================================================

export { default as Agent, type AgentParamsT, type AgentRunInput } from './core/agent.ts';
export { default as AgentState } from './core/agent-state.ts';
export type { AgentTurnRequest, AgentKernelTurn, KernelSnapshot } from './core/agent-state.ts';
export type { CreateAgent } from './core/create-agent.ts';
export type { Attachment, IAgentState, CreateAgentParams } from './core/interfaces.ts';
export {
  AgentService,
  type AgentServiceConfig,
  type AgentRunOptions,
  type AgentRunOutcome,
} from './core/agent.service.ts';
export { AgentFactory } from './core/agent.factory.ts';
export { DefaultPresenter } from './defaults/presenter.ts';
export { ToolLoopAgentRunner } from './runners/tool-loop-agent.runner.ts';

// =============================================================================
// Content Types
// =============================================================================

export {
  ContentType,
  type AgentContent,
  type AgentContentBase,
  type TextContent,
  type AudioContent,
  type ToolContent,
  type ComponentContent,
  type ComponentStreaming,
  type ComponentProps,
  type ToolPartState,
  // Factory functions
  createTextContent,
  createAudioContent,
  createToolContent,
  createComponent,
  createStreamingComponent,
  createComponentResult,
  createComponentError,
  // Utilities
  copyContent,
  toComponentProps,
  isComponentContent,
  isStreamingComponent,
  isComponentLoading,
  isComponentStreaming,
  isComponentDone,
  isStreamingDelta,
  isUserContent,
} from './types/content.ts';

export { AgentMode } from './types/mode.ts';
export { generateId, generateShortId } from './types/id.ts';
export { AgentRetryError, AgentBudgetError } from './types/errors.ts';
export { type AgentLogger, getAgentLogger, setAgentLogger } from './types/logger.ts';
export { type AgentTracer, getAgentTracer, setAgentTracer } from './types/tracer.ts';
export { CancelableStream } from './types/cancelable-stream.ts';
export { ContentStream } from './types/content-stream.ts';
export { EventStream, type EventSink } from './types/event-stream.ts';

// =============================================================================
// Tools
// =============================================================================

export {
  ToolModel,
  type ToolType,
  type FunctionParameters,
  type ToolExecuteResult,
  type ToolExecuteContext,
  type ToolRunnerEvent,
  type ToolOutput,
  type ToolOutputImage,
  type ToolOutputFileContent,
} from './tools/tool-model.ts';

export { ToolRegistry, type IToolRegistry } from './tools/tool-registry.ts';
export { ToolCall } from './tools/tool-call.ts';

export {
  ComponentToolModel,
  createComponentTool,
  isComponentTool,
  type ComponentToolConfig,
} from './tools/component-tool.ts';

export {
  SubagentToolModel,
  createSubagentTool,
  type SubagentConfig,
  type SubagentToolConfig,
} from './tools/subagent-tool.ts';

// =============================================================================
// Kernel
// =============================================================================

export type {
  ToolDefinition,
  ToolInvocationContext,
  ToolKind,
} from './kernel/tooling.ts';

// Re-export FlexibleSchema from AI SDK for consumers defining custom tools
export type { FlexibleSchema } from '@ai-sdk/provider-utils';

export { requireAgentState } from './kernel/require-agent-state.ts';

export type { UiSink } from './kernel/ui-sink.ts';
export type { AgentRunHandle } from './kernel/run-handle.ts';

export type {
  StopPolicy,
  RetryPolicy,
  CheckpointPolicy,
  TurnPolicy,
} from './kernel/policies.ts';

export type {
  KernelModelMiddleware,
  KernelModelMiddlewareContext,
} from './kernel/middlewares/types.ts';

export { wrapModelWithKernelMiddlewares } from './kernel/middlewares/index.ts';

export type { KernelPresenter } from './kernel/presenter.ts';
export type { AgentKernelEventSink, AgentKernelEvent } from './kernel/events.ts';
export type { TurnProcessor, TurnProcessorState } from './kernel/processors/types.ts';

// =============================================================================
// Utilities
// =============================================================================

export { StreamThrottler } from './kernel/utils/stream-throttler.ts';
export { mergeContentDeltas } from './kernel/utils/merge-content-deltas.ts';
export { isPlainObject } from './kernel/utils/type-guards.ts';
export {
  ComponentPropsResolver,
  createComponentPropsResolver,
  type ResolvedComponentProps,
} from './kernel/utils/component-props-resolver.ts';

// =============================================================================
// Telemetry
// =============================================================================

export type {
  TraceOrchestrator,
  TraceRun,
  TraceRunStartParams,
  TraceOrchestratorModelParams,
} from './telemetry/trace-orchestrator.ts';
export { LangfuseTraceOrchestrator } from './telemetry/langfuse-trace-orchestrator.ts';
export { setLangfuseClient, getLangfuseTraceOrchestrator } from './telemetry/langfuse.ts';

// =============================================================================
// Runners
// =============================================================================

export type {
  AgentRunner,
  AgentRunnerHandle,
  AgentRunnerRunOptions,
  AgentStreamEvent,
} from './runners/agent-runner.ts';

// =============================================================================
// Defaults (built-in policies, middlewares, processors)
// =============================================================================

export {
  stopPolicy,
  retryPolicy,
  checkpointPolicy,
  turnPolicy,
  policies as defaultPolicies,
} from './defaults/policies.ts';

export { TurnsLimitMiddleware } from './defaults/middlewares/turns-limit.middleware.ts';
export { FinalPromptCaptureMiddleware } from './defaults/middlewares/final-prompt-capture.middleware.ts';
export { ToolPayloadTruncationMiddleware } from './defaults/middlewares/tool-payload-truncation.middleware.ts';
export {
  type ToolPayloadTruncationConfig,
  DEFAULT_TOOL_PAYLOAD_TRUNCATION_CONFIG,
} from './defaults/middlewares/tool-payload-truncation.config.ts';
export {
  truncateToolPayloadsInPrompt,
  truncateToolPayloadsInModelMessages,
  looksTruncated,
  isToolCallPartLike,
  isToolResultPartLike,
} from './defaults/middlewares/tool-payload-truncation.ts';
export {
  TurnInputProcessor,
  type TurnInputProcessorConfig,
} from './defaults/processors/turn-input.processor.ts';
export { SystemPromptProcessor } from './defaults/processors/system-prompt.processor.ts';
export { HistoryDoctorProcessor } from './defaults/processors/history-doctor.processor.ts';

export {
  FileContentEncoder,
  omitTextContentBySize,
  type AttachmentExtended,
  type FileEncodedContent,
  type FileContentMask,
  FILE_ENCODER_SUPPORTED_EXTENSIONS,
  FILE_ENCODER_SUPPORTED_MIME_TYPES,
} from './files/index.ts';

// Text extensions list
export { textExtensions } from './util/extensions.ts';

// =============================================================================
// Streaming Protocol (wire format between server ↔ client)
// =============================================================================

export type {
  StreamEventNotification,
  StreamEndNotification,
  StreamErrorNotification,
  StreamNotification,
  SubscribeAction,
  ResumeAction,
  AbortAction,
  StreamAction,
  CatchUpResult,
} from './streaming/protocol.ts';

export { RetryLoop, type RetryLoopDeps, type RetryLoopOptions } from './streaming/retry-loop.ts';

// =============================================================================
// Replay Buffer (streaming event buffer + resume)
// =============================================================================

export type {
  StreamMetadata,
  StartStreamOptions,
  StreamEventMessage,
  StreamTransport,
  CatchUpOptions,
  IReplayBuffer,
} from './replay-buffer/types.ts';

export { AbstractReplayBuffer } from './replay-buffer/abstract-replay-buffer.ts';
export {
  MemoryReplayBuffer,
  type MemoryReplayBufferOptions,
} from './replay-buffer/memory-replay-buffer.ts';

// =============================================================================
// Cache (prompt caching strategies)
// =============================================================================

export {
  // Interface
  type CacheStrategy,
  // Base classes
  AbstractCacheStrategy,
  NoCacheStrategy,
  // Anthropic/Claude strategies
  ClaudeCacheStrategy,
  type ClaudeCacheStrategyConfig,
  BedrockCacheStrategy,
  type BedrockCacheStrategyConfig,
  OpenRouterClaudeCacheStrategy,
  // Factory
  CacheStrategyFactory,
  type CacheStrategyFactoryConfig,
  // Middleware
  CacheStrategyMiddleware,
  type CacheStrategyMiddlewareConfig,
} from './cache/index.ts';

// =============================================================================
// Storage (adapter-based storage system)
// =============================================================================

export {
  // Main class
  AgentStorage,
  // Types
  type NamedAdapter,
  type AgentStorageParams,
  type StorageReadOptions,
  type StorageWriteOptions,
  type StorageWriteResult,
  type StorageFileMetadata,
  type AdapterFileMetadata,
  type RawFileMetadata,
  // Adapters
  AbstractStorageAdapter,
  AgentPlaceApiAdapter,
  LocalFileSystemAdapter,
  InMemoryAdapter,
  type AgentPlaceApiAdapterParams,
  type LocalFileSystemAdapterParams,
  // Errors
  StorageError,
  StorageFileNotFoundError,
  StorageAdapterNotFoundError,
  StorageNoWritableAdapterError,
  StorageApiError,
  StorageLocalError,
  // Cache
  StorageCache,
  type StorageCacheParams,
  // Utilities
  getMimeType,
} from './storage/index.ts';

// =============================================================================
// State (agent ↔ platform connection)
// =============================================================================

export {
  StateConnection,
  type StateConnectionOptions,
  type IStateTransport,
  type IStateTransportAdapter,
} from './state/state-connection.ts';

export { AgentStateStore } from './state/agent-state-store.ts';
export { RpcStateBackend } from './state/rpc-state-backend.ts';
export { InMemoryStateBackend } from './state/in-memory-state-backend.ts';
export { globMatch } from './state/glob-match.ts';
export type {
  StateChangeEvent,
  StateBackend,
  PathRule,
  Unsubscribe,
} from './state/types.ts';

// =============================================================================
// Events (inbox pipeline, trigger handlers)
// =============================================================================

export {
  EventProcessor,
  type EventProcessorOptions,
} from './events/event-processor.ts';

export {
  TriggerDispatcher,
  type TriggerDispatcherOptions,
} from './events/trigger-dispatcher.ts';

export { TriggerRouter } from './events/trigger-router.ts';

export {
  InboxReconciler,
  type InboxReconcilerOptions,
} from './events/inbox-reconciler.ts';

export type {
  TriggerEvent,
  TriggerContext,
  TriggerHandler,
  TriggerHandlerResult,
  UnhandledTriggerCallback,
} from './events/types.ts';
