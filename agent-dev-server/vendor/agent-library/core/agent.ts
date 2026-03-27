import { ContentType, type AgentContent, type ComponentContent } from '../types/content.ts';
import { AgentRetryError, AgentBudgetError } from '../types/errors.ts';
import { getAgentLogger } from '../types/logger.ts';
import { generateShortId } from '../types/id.ts';
import { CancelableStream } from '../types/cancelable-stream.ts';
import { ContentStream } from '../types/content-stream.ts';
import { EventStream } from '../types/event-stream.ts';
import { AgentMode } from '../types/mode.ts';

import AgentState from './agent-state.ts';
import { ToolRegistry, type IToolRegistry } from '../tools/tool-registry.ts';
import { AgentService, type AgentRunOutcome } from './agent.service.ts';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { AgentRunner } from '../runners/agent-runner.ts';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import {
  type KernelModelMiddleware,
  wrapModelWithKernelMiddlewares,
} from '../kernel/middlewares/index.ts';
import type { AgentKernelEventSink } from '../kernel/events.ts';
import type { AgentRunHandle } from '../kernel/run-handle.ts';
import type { CheckpointPolicy, RetryPolicy, StopPolicy, TurnPolicy } from '../kernel/policies.ts';
import type { KernelPresenter } from '../kernel/presenter.ts';
import type { ZodType } from 'zod';
import type { Attachment } from './interfaces.ts';
import { FinalPromptCaptureMiddleware } from '../defaults/middlewares/final-prompt-capture.middleware.ts';
import { TurnInputProcessor } from '../defaults/processors/turn-input.processor.ts';
import type { TurnProcessor } from '../kernel/processors/types.ts';
import { SystemPromptProcessor } from '../defaults/processors/system-prompt.processor.ts';
import { HistoryDoctorProcessor } from '../defaults/processors/history-doctor.processor.ts';
import { applyProcessors } from './apply-processors.ts';
import { policies as defaultPolicies } from '../defaults/policies.ts';
import { DefaultPresenter } from '../defaults/presenter.ts';
import { ToolLoopAgentRunner } from '../runners/tool-loop-agent.runner.ts';
import type { TraceOrchestrator } from '../telemetry/trace-orchestrator.ts';

export type AgentParamsT = {
  /** Agent execution mode */
  agentMode?: AgentMode;
  /** Initial agent state. If not provided, a new state will be created. */
  state?: AgentState;
  /** Trace name for observability. Sets `state.traceConfig.name`. */
  traceName?: string;
  /** System instruction/prompt template */
  systemInstruction: string;
  /** Tool registry. If not provided, an empty registry will be used. */
  toolRegistry?: IToolRegistry;
  /** Language model to use */
  model?: LanguageModelV3;
  /** Execution limits */
  limits?: {
    maxTurns?: number;
    maxModelCalls?: number;
    maxRetries?: number;
  };
  /** Model configuration */
  modelSettings?: {
    temperature?: number;
    maxOutputTokens?: number;
    providerOptions?: ProviderOptions;
  };
  /** Model middlewares for prompt transformation */
  modelMiddlewares?: KernelModelMiddleware[];
  /** Turn processors */
  processors?: TurnProcessor[];
  /** Agent runner. Defaults to AgentRunner. */
  runner?: AgentRunner;
  /** Policies for controlling agent behavior. Defaults to built-in policies. */
  policies?: {
    stop?: StopPolicy;
    retry?: RetryPolicy;
    checkpoint?: CheckpointPolicy;
    turn?: TurnPolicy;
  };
  /** Event sink for observability */
  onEvent?: AgentKernelEventSink;
  /** External trace orchestrator (e.g., Langfuse SDK) */
  traceOrchestrator?: TraceOrchestrator;
  /** Callback when agent completes */
  onComplete?: (args: { state: AgentState; outcome: AgentRunOutcome }) => void | Promise<void>;
  /** UI presenter. Defaults to DefaultPresenter. */
  presenter?: KernelPresenter;
};

/**
 * Input for agent.run() and agent.runHandle()
 */
export type AgentRunInput = {
  /** User query/instruction */
  query: string;
  /** File attachments */
  attachments?: Attachment[];
};

const logger = getAgentLogger();

export default class Agent implements Agent {
  private readonly state: AgentState;
  private readonly systemInstruction: string;
  private readonly toolRegistry: IToolRegistry;
  private readonly model: LanguageModelV3 | undefined;
  private maxAgentTurns: number;
  private maxModelCallsCount: number;
  private maxRetries: number;
  private modelSettings:
    | { temperature?: number; maxOutputTokens?: number; providerOptions?: ProviderOptions }
    | undefined;
  private agentMode: AgentMode;
  private isDone: boolean = false;
  private modelMiddlewares: KernelModelMiddleware[];
  private runner: AgentRunner;
  private policies: {
    stop: StopPolicy;
    retry: RetryPolicy;
    checkpoint: CheckpointPolicy;
    turn: TurnPolicy;
  };
  private onEvent?: AgentKernelEventSink;
  private traceOrchestrator?: TraceOrchestrator;
  private onComplete?: AgentParamsT['onComplete'];
  private presenter: KernelPresenter;
  private runDone: ((outcome: AgentRunOutcome) => void) | null = null;
  private runDonePromise: Promise<AgentRunOutcome> | null = null;
  private nextRetryDelayMs: number = 1000;
  private outputSchema: ZodType<unknown> | undefined;
  private processors: TurnProcessor[];

  private currentContentStream: ContentStream | undefined;
  private currentEventStream: EventStream | undefined;
  private lastRun: AgentRunOutcome | null = null;
  /** Abort controller for the currently running turn (model + tools). */
  private currentAbortController: AbortController | null = null;

  constructor(params: AgentParamsT) {
    // Create default state if not provided
    this.state =
      params.state ??
      AgentState.createTurn({
        kernel: {
          conversationHistory: [],
          trace: params.traceName ? { name: params.traceName } : undefined,
        },
      });

    // If state was provided but traceName is also provided, update trace config
    if (params.state && params.traceName) {
      this.state.setTraceConfig({ name: params.traceName });
    }

    this.systemInstruction = params.systemInstruction;
    this.toolRegistry = params.toolRegistry ?? new ToolRegistry([]);
    this.model = params.model;
    this.agentMode = params.agentMode ?? AgentMode.Agent;
    this.maxAgentTurns = params.limits?.maxTurns ?? 5;
    this.maxModelCallsCount = params.limits?.maxModelCalls ?? 50;
    this.maxRetries = params.limits?.maxRetries ?? 3;
    this.modelSettings = params.modelSettings;
    this.modelMiddlewares = params.modelMiddlewares ?? [];
    this.processors = params.processors ?? [
      new SystemPromptProcessor(() => this.getSystemInstruction()),
      new HistoryDoctorProcessor(),
      new TurnInputProcessor(),
    ];

    // Default runner: ToolLoopAgentRunner
    this.runner = params.runner ?? new ToolLoopAgentRunner();

    // Default policies: merge with provided
    this.policies = {
      stop: params.policies?.stop ?? defaultPolicies.stop,
      retry: params.policies?.retry ?? defaultPolicies.retry,
      checkpoint: params.policies?.checkpoint ?? defaultPolicies.checkpoint,
      turn: params.policies?.turn ?? defaultPolicies.turn,
    };

    this.onEvent = params.onEvent;
    this.traceOrchestrator = params.traceOrchestrator;
    this.onComplete = params.onComplete;

    // Default presenter
    this.presenter = params.presenter ?? new DefaultPresenter();
  }

  getState(): AgentState {
    return this.state;
  }

  async runHandle(input: AgentRunInput): Promise<AgentRunHandle>;
  async runHandle<TResult>(
    input: AgentRunInput,
    options: { outputSchema: ZodType<TResult> },
  ): Promise<AgentRunHandle<TResult>>;
  async runHandle<TResult>(
    input: AgentRunInput,
    options?: { outputSchema?: ZodType<TResult> },
  ): Promise<AgentRunHandle<TResult>> {
    if (this.runDonePromise) {
      throw new Error('Agent.runHandle() can only be called once per Agent instance');
    }
    const contentStream = new ContentStream();
    const eventStream = new EventStream();
    const cancelableStream = new CancelableStream(async () => contentStream);
    this.outputSchema = options?.outputSchema as ZodType<unknown> | undefined;

    // Store event stream for use in callAgent
    this.currentEventStream = eventStream;

    // Set input on state
    this.state.setUserQueryText(input.query);
    this.state.setAttachments(input.attachments);

    this.runDonePromise = new Promise<AgentRunOutcome>((resolve) => {
      this.runDone = resolve;
    });

    this.onEvent?.({ type: 'run-start', agentMode: this.agentMode });

    cancelableStream.on('abort', () => {
      this.presenter.emitCheckpoint({ sink: contentStream, state: this.state });
      logger.info('[Agent] Stopping agent because stream was aborted');
      this.currentAbortController?.abort();
      this.stopProcessing(contentStream);
    });
    this.callAgent(contentStream).catch((error) => {
      logger.error('[Agent] Unhandled error in callAgent:', { error });
    });

    const result = options?.outputSchema
      ? this.runDonePromise.then((outcome) => {
          if (outcome.status !== 'ok') {
            throw new Error(`Run did not complete successfully (${outcome.status})`);
          }
          return options.outputSchema!.parse(outcome.structuredOutput);
        })
      : undefined;

    return { stream: cancelableStream, events: eventStream, done: this.runDonePromise, result };
  }

  /**
   * Run the agent with the given input and return a stream of content.
   *
   * @example
   * ```typescript
   * const stream = await agent.run({ query: 'What is the weather in Tokyo?' });
   * for await (const content of stream) {
   *   console.log(content);
   * }
   * ```
   */
  async run(input: AgentRunInput): Promise<CancelableStream<AgentContent>> {
    const handle = await this.runHandle(input);
    return handle.stream;
  }

  private getSystemInstruction() {
    return this.systemInstruction;
  }

  private getStopAtToolNamesByAgentMode(agentMode: AgentMode): string[] | undefined {
    const configured = this.policies.stop({
      agentMode,
      toolRegistry: this.toolRegistry,
    }).stopAtToolNames;
    return configured && configured.length > 0 ? configured : undefined;
  }

  async callAgent(resultingStream: ContentStream) {
    let turnIndex = 0;
    while (!this.isDone) {
      try {
        this.onEvent?.({ type: 'turn-start', turnIndex });
        if (this.state.getModelCallsCount() >= this.maxAgentTurns) {
          logger.info('[Agent] Stopping agent because max agent turns exceeded');
          this.stopProcessing(resultingStream);
          return;
        }

        if (this.state.getRetriesCount() >= this.maxRetries) {
          logger.info('[Agent] Stopping agent because max retries exceeded');
          this.stopProcessing(resultingStream);
          return;
        }

        const messages = await applyProcessors({
          state: this.state,
          processors: this.processors,
        });

        this.presenter.emitCheckpoint({ sink: resultingStream, state: this.state });
        this.populateStateWithModelInfo();

        if (!this.model) {
          throw new Error('Model is required to run the agent');
        }

        const modelToUse: LanguageModelV3 = wrapModelWithKernelMiddlewares({
          model: this.model,
          ctx: { state: this.state },
          middlewares: [...this.modelMiddlewares, new FinalPromptCaptureMiddleware()],
        });

        const abortController = new AbortController();
        this.currentAbortController = abortController;

        const agentService = new AgentService({
          state: this.state,
          toolRegistry: this.toolRegistry,
          runner: this.runner,
          traceOrchestrator: this.traceOrchestrator,
          abortController,
        });

        this.state.setError(null);

        this.currentContentStream = new ContentStream();

        const runPromise = agentService.stream({
          ui: this.currentContentStream,
          eventSink: this.currentEventStream,
          instructions: '',
          model: modelToUse,
          messages,
          modelSettings: this.modelSettings,
          maxSteps: this.maxModelCallsCount,
          stopAtToolNames: this.getStopAtToolNamesByAgentMode(this.agentMode),
          structuredOutputSchema: this.outputSchema,
        });

        for await (const content of this.currentContentStream) {
          if (content) {
            content.responseId = this.state.getResponseId();
            if (!content.messageId) {
              (content as AgentContent).messageId = generateShortId(4);
            }
            resultingStream.append(content);
          }

          if (
            content.type !== ContentType.Text &&
            !(
              content.type === ContentType.Component &&
              (content as ComponentContent).streaming?.state === 'input-streaming'
            )
          ) {
            this.presenter.emitCheckpoint({ sink: resultingStream, state: this.state });
          }
        }

        this.lastRun = await runPromise;
        this.onEvent?.({ type: 'turn-end', turnIndex, outcome: this.lastRun });

        const shouldEmit = this.policies.checkpoint({
          phase: 'turn-end',
          lastRun: this.lastRun,
        }).shouldEmitStateUpdate;

        if (shouldEmit) {
          this.presenter.emitCheckpoint({ sink: resultingStream, state: this.state });
        }
        if (this.lastRun.status === 'error') {
          this.handleError(this.lastRun.error, resultingStream);
        }

        if (this.lastRun.status === 'ok' && this.lastRun.stopReason === 'max-steps') {
          this.presenter.emitCheckpoint({ sink: resultingStream, state: this.state });
          this.presenter.emitExecutionLimit({
            sink: resultingStream,
            state: this.state,
            maxExecutions: this.maxModelCallsCount,
          });
          this.stopProcessing(resultingStream);
          return;
        }

        if (
          this.lastRun.status === 'ok' &&
          this.agentMode !== AgentMode.Agent &&
          this.lastRun.stoppedByToolName
        ) {
          logger.info(
            `[Agent] Stopping because tool "${this.lastRun.stoppedByToolName}" was invoked in mode "${this.agentMode}"`,
          );
          this.stopProcessing(resultingStream);
          return;
        }

        logger.info('[Agent] Stream ended');
        this.state.increaseModelCallsCount();
        turnIndex += 1;

        // Reset escalation after a successful turn (no error).
        // Truncation already persisted to state, so the next turn starts
        // from a compacted baseline without being unnecessarily aggressive.
        if (this.state.getTruncationEscalationLevel() > 0 && !this.state.getError()) {
          this.state.resetTruncationEscalationLevel();
        }

        if (this.state.getError()) {
          const delayMs = this.nextRetryDelayMs;
          this.nextRetryDelayMs = 1000;
          this.onEvent?.({ type: 'retry-scheduled', delayMs });
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        const decision = await this.policies.turn({
          phase: 'turn-end',
          agentMode: this.agentMode,
          state: this.state,
          outcome: this.lastRun ?? { status: 'aborted', history: [] },
          sink: resultingStream,
          presenter: this.presenter,
        });
        if (decision.shouldStop) {
          logger.info('[Agent] Stopping agent because TurnPolicy requested stop');
          this.stopProcessing(resultingStream);
        }
      } catch (error) {
        this.handleError(error, resultingStream);
      } finally {
        this.currentContentStream = undefined;
        this.lastRun = null;
        this.currentAbortController = null;
      }
    }
  }

  private populateStateWithModelInfo() {
    if (!this.state.getModelId?.() && this.model?.modelId) {
      this.state.setModelId?.(this.model.modelId);
      this.state.setProvider?.(this.model.provider);
    }
  }

  private processRetryableError(error: unknown, resultingStream: ContentStream, text?: string) {
    const message =
      text ?? '\n\nThe connection to model provider has suddenly terminated. Let me try again.';
    this.state.increaseRetriesCount();
    this.state.setError(error instanceof Error ? error : new Error('Retryable error'));
    this.presenter.emitRetryNotice({
      sink: resultingStream,
      state: this.state,
      message,
    });
  }

  private handleError(error: unknown, resultingStream: ContentStream) {
    this.onEvent?.({ type: 'error', error });
    logger.error('[Agent] handleError Error:', { error });

    if (error instanceof AgentBudgetError) {
      this.stopProcessing(resultingStream, `I need more tokens to perform this task.`);
      return;
    }
    if (error instanceof AgentRetryError) {
      this.stopProcessing(
        resultingStream,
        'I have already performed too many retries to complete the task.',
      );
      return;
    }

    const decision = this.policies.retry({
      error,
      state: this.state,
      retries: this.state.getRetriesCount(),
      maxRetries: this.maxRetries,
    });

    this.nextRetryDelayMs = decision.delayMs;

    if (decision.triggerTruncation) {
      const newLevel = this.state.increaseTruncationEscalationLevel();
      logger.info('[Agent] Escalated truncation level due to "too long" error', {
        truncationEscalationLevel: newLevel,
      });
    }

    if (!decision.shouldRetry) {
      this.stopProcessing(resultingStream, decision.userMessage ?? 'Sorry, an error occurred.');
      return;
    }

    if (decision.triggerTruncation) {
      this.state.increaseRetriesCount();
      this.state.setError(error instanceof Error ? error : new Error('Prompt too long'));
      return;
    }

    this.processRetryableError(error, resultingStream);
  }

  private stopProcessing(resultingStream: ContentStream, message?: string) {
    logger.info(`[Agent] stopProcessing called`);
    if (this.isDone) {
      return;
    }

    this.isDone = true;

    this.currentAbortController?.abort();

    if (message) {
      this.presenter.emitTerminalMessage({ sink: resultingStream, state: this.state, message });
    }
    resultingStream.endStream();
    try {
      this.currentContentStream?.endStream();
      this.currentEventStream?.endStream();
    } catch (error) {
      logger.error('[Agent] Error ending streams:', { error });
    }

    const outcome: AgentRunOutcome = this.lastRun ?? {
      status: 'aborted',
      history: this.state.getConversationHistory(),
    };

    try {
      const maybe = this.onComplete?.({ state: this.state, outcome });
      if (maybe && typeof (maybe as Promise<void>).catch === 'function') {
        (maybe as Promise<void>).catch((err) => logger.warn('[Agent] onComplete failed', { err }));
      }
    } catch (err) {
      logger.warn('[Agent] onComplete failed', { err });
    }

    this.runDone?.(outcome);
    this.runDone = null;
  }
}
