/**
 * AgentService
 *
 * Streaming adapter between ActionAgent and the framework runner (`AgentRunner`).
 *
 * Responsibilities:
 * - convert ToolRegistry tools into ToolDefinition[] and AI SDK Tool[]
 * - execute server tools via `ToolModel.execute(...)` when the runner requests it
 * - translate runner events (`AgentStreamEvent`) into UI stream content
 * - return a single `AgentRunOutcome` for ActionAgent to decide retry/stop
 */
import type { IToolRegistry } from '../tools/tool-registry.ts';
import type { ToolModel, ToolRunnerEvent, ToolExecuteContext } from '../tools/tool-model.ts';
import { createTextContent, createComponent, type ToolPartState } from '../types/content.ts';
import { generateShortId } from '../types/id.ts';
import { getAgentLogger } from '../types/logger.ts';
import type AgentState from './agent-state.ts';
import type { UiSink } from '../kernel/ui-sink.ts';
import type { ToolInvocationContext } from '../kernel/tooling.ts';
import type { ModelMessage } from '@ai-sdk/provider-utils';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { AgentRunner, AgentRunnerHandle, AgentStreamEvent } from '../runners/agent-runner.ts';
import type { ToolDefinition } from '../kernel/tooling.ts';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { Tool as AiSdkTool } from 'ai';
import type { ZodType } from 'zod';
import type { TraceOrchestrator, TraceRun } from '../telemetry/trace-orchestrator.ts';
import { getLangfuseTraceOrchestrator } from '../telemetry/langfuse.ts';
import type { EventSink } from '../types/event-stream.ts';

const logger = getAgentLogger();

export interface AgentServiceConfig {
  toolRegistry: IToolRegistry;
  state: AgentState;
  abortController?: AbortController;
  runner: AgentRunner;
  traceOrchestrator?: TraceOrchestrator;
}

export interface AgentRunOptions {
  model: LanguageModelV3;
  instructions: string;
  messages: ModelMessage[];
  ui: UiSink;
  /** Optional event sink for raw AgentStreamEvent forwarding */
  eventSink?: EventSink;
  maxSteps?: number;
  stopAtToolNames?: string[];
  structuredOutputSchema?: ZodType<unknown>;
  modelSettings?: {
    temperature?: number;
    maxOutputTokens?: number;
    providerOptions?: ProviderOptions;
  };
}

export type AgentRunOutcome =
  | {
      status: 'ok';
      history: ModelMessage[];
      stoppedByToolName?: string;
      structuredOutput?: unknown;
      stopReason?: 'max-steps';
    }
  | { status: 'aborted'; history: ModelMessage[] }
  | { status: 'error'; history: ModelMessage[]; error: unknown };

export class AgentService {
  private config: AgentServiceConfig;
  private toolModelMap: Map<string, ToolModel<unknown>> = new Map();
  private abortController: AbortController;
  private runner: AgentRunner;
  private traceOrchestrator?: TraceOrchestrator;

  private tempIdForText: string | null = null;
  private tempIdForReasoning: string | null = null;

  /** Track accumulated input deltas for tools using the new execute() API */
  private toolPartDeltas: Map<string, string> = new Map();

  private getTraceToolOutput(toolName: string, rawOutput: unknown): unknown {
    const toolModel = this.toolModelMap.get(toolName);
    const aiTool = toolModel?.getAiSdkTool?.();
    const toModelOutput = (aiTool as any)?.toModelOutput;
    if (typeof toModelOutput !== 'function') {
      return rawOutput;
    }
    try {
      return toModelOutput({ output: rawOutput });
    } catch (error: any) {
      console.error('[AgentService] Error calling toModelOutput', error);
      return rawOutput;
    }
  }

  constructor(config: AgentServiceConfig) {
    this.config = config;
    this.abortController = config.abortController ?? new AbortController();
    this.runner = config.runner;
    this.traceOrchestrator = config.traceOrchestrator;
    this.buildToolModelMap();
  }

  /**
   * Emit a streaming component with the given state.
   *
   * Note: Tool output is intentionally NOT sent to the UI.
   * - The model receives output via toModelOutput in tools.ts
   * - The UI receives curated data via `props` (from uiProps)
   * - Sending raw output would cause massive payloads (e.g., 16MB from url-file-reader)
   */
  private emitStreamingComponent(
    ui: UiSink,
    toolCallId: string,
    toolName: string,
    state: ToolPartState,
    updates?: {
      inputDelta?: string;
      input?: Record<string, unknown>;
      error?: string;
      props?: Record<string, unknown>;
    },
  ): void {
    const tool = this.toolModelMap.get(toolName);
    const componentName = tool?.getComponentName() ?? toolName;

    ui.append(
      createComponent({
        messageId: toolCallId,
        responseId: this.config.state.getResponseId(),
        componentName,
        props: updates?.props,
        streaming: {
          toolName,
          toolCallId,
          state,
          inputDelta: updates?.inputDelta,
          input: updates?.input,
          error: updates?.error,
        },
      }),
    );
  }

  async stream(options: AgentRunOptions): Promise<AgentRunOutcome> {
    const ui = options.ui;
    const eventSink = options.eventSink;

    const toolDefinitions: ToolDefinition[] = this.config.toolRegistry
      .getAllTools()
      .map((t) => t.getDefinition());

    const aiSdkToolset: Record<string, AiSdkTool<unknown, unknown>> = {};
    for (const toolModel of this.config.toolRegistry.getAllTools()) {
      const tool = toolModel.getAiSdkTool();
      if (!tool) {
        continue;
      }
      const name = toolModel.getName();
      if (aiSdkToolset[name]) {
        logger.warn('[AgentService] Duplicate AI SDK tool name', { toolName: name });
        continue;
      }
      aiSdkToolset[name] = tool;
    }

    const stopAt = Array.isArray(options.stopAtToolNames) ? new Set(options.stopAtToolNames) : null;
    let stoppedByToolName: string | undefined;
    let streamError: unknown | undefined;
    let aborted = false;
    let structuredOutput: unknown | undefined;
    let stopReason: 'max-steps' | undefined;

    const executeTool = async (params: {
      toolName: string;
      toolCallId: string;
      input: unknown;
      rawArgs: string;
    }): Promise<unknown> => {
      const toolModel = this.toolModelMap.get(params.toolName);
      if (!toolModel?.execute) {
        throw new Error(`[AgentService] Tool '${params.toolName}' must implement execute()`);
      }

      const input = params.input as Record<string, unknown>;
      const accumulatedDelta = this.toolPartDeltas.get(params.toolCallId) ?? '';

      // Emit input-available state
      this.emitStreamingComponent(ui, params.toolCallId, params.toolName, 'input-available', {
        input,
        inputDelta: accumulatedDelta,
      });

      // Emit output-pending state
      this.emitStreamingComponent(ui, params.toolCallId, params.toolName, 'output-pending', {
        input,
        inputDelta: accumulatedDelta,
      });

      try {
        const executeCtx: ToolExecuteContext = {
          runner: {
            state: this.config.state,
            abortSignal: this.abortController.signal,
          },
          abortSignal: this.abortController.signal,
          toolCallId: params.toolCallId,
          onProgress: (props: Record<string, unknown>) => {
            this.emitStreamingComponent(ui, params.toolCallId, params.toolName, 'output-pending', {
              input,
              inputDelta: accumulatedDelta,
              props,
            });
          },
        };

        const result = await toolModel.execute(input, executeCtx);

        // Emit output-available state (output not sent - model-only, UI uses props)
        this.emitStreamingComponent(ui, params.toolCallId, params.toolName, 'output-available', {
          input,
          inputDelta: accumulatedDelta,
          props: result.uiProps,
        });

        // Cleanup
        this.toolPartDeltas.delete(params.toolCallId);

        return result.output;
      } catch (error) {
        // Emit output-error state
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.emitStreamingComponent(ui, params.toolCallId, params.toolName, 'output-error', {
          input,
          inputDelta: accumulatedDelta,
          error: errorMessage,
        });

        // Cleanup
        this.toolPartDeltas.delete(params.toolCallId);

        throw error;
      }
    };

    let handle: AgentRunnerHandle | undefined;
    let traceRun: TraceRun | undefined;

    const appContext = this.getTraceContextFromApp();
    const traceOrchestrator = this.traceOrchestrator ?? getLangfuseTraceOrchestrator();
    if (!traceOrchestrator) {
      logger.debug('[AgentService] Trace orchestrator is not configured');
    }

    try {
      const traceName = this.config.state.getTraceConfig()?.name ?? 'Agent';
      traceRun = traceOrchestrator?.startRun({
        traceName,
        input: options.messages,
        userId: appContext?.userId,
        agentId: appContext?.agentId,
        requestId: appContext?.requestId,
        metadata: {
          responseId: this.config.state.getResponseId(),
        },
        model: this.config.state.getModelId(),
        provider: this.config.state.getProvider(),
        modelParameters: options.modelSettings,
      });
      if (traceRun?.traceId) {
        try {
          this.config.state.setTraceId(traceRun.traceId);
        } catch (error) {
          logger.warn('[AgentService] Failed to store traceId', { error });
        }
      }

      handle = await this.runner.runStream({
        model: options.model,
        instructions: options.instructions,
        messages: options.messages,
        tools: toolDefinitions,
        aiSdkToolset,
        stopAtToolNames: options.stopAtToolNames,
        maxSteps: options.maxSteps ?? 20,
        abortSignal: this.abortController.signal,
        executeTool,
        appState: this.config.state,
        onStepMessages: (stepMessages) => {
          this.config.state.setStepMessages(stepMessages);
        },
        structuredOutputSchema: options.structuredOutputSchema,
        modelSettings: options.modelSettings,
      });

      if (handle?.traceId) {
        try {
          this.config.state.setTraceId(handle.traceId);
        } catch (error) {
          logger.warn('[AgentService] Failed to store traceId', { error });
        }
      }

      for await (const ev of handle.events) {
        // Forward raw event to eventSink (for transport/WebSocket)
        eventSink?.append(ev);

        if (ui.isEnded()) {
          aborted = true;
          this.abortController.abort();
          break;
        }
        if (ev.type === 'stream-error') {
          streamError = ev.error;
          break;
        }
        if (ev.type === 'model-step-start') {
          const finalPrompt = this.config.state.getLastFinalPrompt?.();
          traceRun?.onModelStepStart({
            stepIndex: ev.stepIndex,
            input: finalPrompt ?? options.messages,
            model: this.config.state.getModelId(),
            provider: this.config.state.getProvider(),
            modelParameters: options.modelSettings,
          });
        }
        if (ev.type === 'model-step-end') {
          traceRun?.onModelStepEnd({
            stepIndex: ev.stepIndex,
            output: this.config.state.getStepMessages(),
            usage: ev.usage,
          });

          // Log usage info after each LLM call
          if (ev.usage) {
            logger.info('[AgentService] LLM call usage:', {
              stepIndex: ev.stepIndex,
              usage: ev.usage,
            });
          }
        }
        if (ev.type === 'tool-call' && stopAt && stopAt.has(ev.toolName)) {
          stoppedByToolName = ev.toolName;
        }
        if (ev.type === 'tool-call') {
          traceRun?.onToolStart({
            toolCallId: ev.toolCallId,
            toolName: ev.toolName,
            input: ev.input,
          });
        }
        if (ev.type === 'tool-result') {
          traceRun?.onToolEnd({
            toolCallId: ev.toolCallId,
            output: this.getTraceToolOutput(ev.toolName, ev.output),
          });
        }
        if (ev.type === 'tool-error') {
          traceRun?.onToolEnd({
            toolCallId: ev.toolCallId,
            error: ev.error,
          });
        }
        this.handleEvent(ev, ui);
        if (ev.type === 'finish') {
          break;
        }
      }
    } catch (error) {
      streamError = error;
    } finally {
      const doneInfo = await handle?.done;
      structuredOutput = doneInfo?.structuredOutput;
      stopReason = doneInfo?.stopReason;

      ui.endStream();
      eventSink?.endStream();
    }

    this.config.state.commitStepMessages();

    const history = this.config.state.getConversationHistory();
    if (streamError) {
      logger.error('[AgentService] Stream error', { streamError });
      traceRun?.onRunEnd({
        status: 'error',
        error: streamError,
        conversationHistory: history,
      });
      await traceRun?.flush?.();
      return { status: 'error', history, error: streamError };
    }
    if (aborted) {
      traceRun?.onRunEnd({ status: 'aborted', conversationHistory: history });
      await traceRun?.flush?.();
      return { status: 'aborted', history };
    }
    traceRun?.onRunEnd({
      status: 'ok',
      output: structuredOutput ?? history,
      conversationHistory: history,
    });
    await traceRun?.flush?.();
    return stoppedByToolName
      ? { status: 'ok', history, stoppedByToolName, structuredOutput, stopReason }
      : { status: 'ok', history, structuredOutput, stopReason };
  }

  private getTraceContextFromApp(): {
    userId?: string;
    agentId?: string;
    requestId?: string;
  } | null {
    const app = this.config.state.getApp<unknown>();
    if (!app || typeof app !== 'object' || Array.isArray(app)) {
      return null;
    }
    const record = app as Record<string, unknown>;
    const userId = typeof record.userId === 'string' ? record.userId : undefined;
    const agentId = typeof record.agentId === 'string' ? record.agentId : undefined;
    const requestId = typeof record.requestId === 'string' ? record.requestId : undefined;
    if (!userId && !agentId && !requestId) {
      return null;
    }
    return { userId, agentId, requestId };
  }

  private buildToolModelMap(): void {
    this.toolModelMap.clear();
    for (const toolModel of this.config.toolRegistry.getAllTools()) {
      this.toolModelMap.set(toolModel.getName(), toolModel as ToolModel<unknown>);
    }
  }

  private handleEvent(event: AgentStreamEvent, contentStream: UiSink): void {
    if (event.type === 'stream-error') {
      return;
    }
    if (event.type === 'model-step-start' || event.type === 'model-step-end') {
      return;
    }
    if (event.type === 'text-delta') {
      this.handleTextDelta(event.messageId, event.textDelta, contentStream, false);
      return;
    }
    if (event.type === 'reasoning-delta') {
      this.handleTextDelta(event.messageId, event.textDelta, contentStream, true);
      return;
    }
    if (event.type === 'tool-input-start') {
      this.tempIdForText = null;
      this.tempIdForReasoning = null;
      this.handleToolInputStart(event.toolCallId, event.toolName, contentStream);
      return;
    }
    if (event.type === 'tool-input-delta') {
      this.handleToolInputDelta(event.toolCallId, event.delta, contentStream);
      return;
    }
    if (event.type === 'tool-input-end') {
      this.handleToolInputEnd(event.toolCallId, contentStream);
      return;
    }
    if (event.type === 'tool-call') {
      this.dispatchToolRunnerEvent(
        {
          type: 'tool-call',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: event.input,
        },
        contentStream,
      );
      return;
    }
    if (event.type === 'tool-result') {
      this.dispatchToolRunnerEvent(
        {
          type: 'tool-result',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          output: event.output,
        },
        contentStream,
      );
      return;
    }
    if (event.type === 'tool-error') {
      this.dispatchToolRunnerEvent(
        {
          type: 'tool-error',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          error: event.error,
        },
        contentStream,
      );
      return;
    }
    if (event.type === 'finish') {
      return;
    }
  }

  private handleTextDelta(
    messageIdFromRunner: string | undefined,
    delta: string,
    contentStream: UiSink,
    isReasoning: boolean,
  ): void {
    const responseId = this.config.state.getResponseId();
    let messageId = messageIdFromRunner;
    if (typeof messageId !== 'string' || messageId.length === 0) {
      const temp = isReasoning ? this.tempIdForReasoning : this.tempIdForText;
      if (temp) {
        messageId = temp;
      } else {
        messageId = generateShortId(4);
        if (isReasoning) {
          this.tempIdForReasoning = messageId;
        } else {
          this.tempIdForText = messageId;
        }
      }
    }

    contentStream.append(
      createTextContent({
        messageId,
        responseId,
        content: delta,
        isReasoning,
      }),
    );
  }

  /** Track current tool name for each tool call (needed for ToolPart emission) */
  private toolCallNames: Map<string, string> = new Map();

  private handleToolInputStart(callId: string, toolName: string, contentStream: UiSink): void {
    // Track tool name for this call
    this.toolCallNames.set(callId, toolName);

    // ToolPart-only: emit input-streaming state
    this.toolPartDeltas.set(callId, '');
    this.emitStreamingComponent(contentStream, callId, toolName, 'input-streaming', {
      inputDelta: '',
    });
  }

  private handleToolInputDelta(callId: string, delta: string, contentStream: UiSink): void {
    const toolName = this.toolCallNames.get(callId);

    if (!toolName) {
      return;
    }

    // Accumulate delta and emit ToolPart
    const currentDelta = this.toolPartDeltas.get(callId) || '';
    const newDelta = currentDelta + delta;
    this.toolPartDeltas.set(callId, newDelta);

    this.emitStreamingComponent(contentStream, callId, toolName, 'input-streaming', {
      inputDelta: delta, // Send just the new delta, UI accumulates
    });
  }

  private handleToolInputEnd(callId: string, _contentStream: UiSink): void {
    this.toolCallNames.delete(callId);
  }

  /**
   * Dispatch runner tool events to tool models.
   *
   * This is required for provider-native tools (executed by the provider/AI SDK)
   * and any tool implementations that choose to render UI directly from runner events.
   */
  private dispatchToolRunnerEvent(event: ToolRunnerEvent, contentStream: UiSink): void {
    const toolModel = this.toolModelMap.get(event.toolName);
    if (!toolModel) {
      return;
    }

    const rawArgs =
      event.type === 'tool-call'
        ? JSON.stringify(event.input ?? {})
        : event.type === 'tool-result'
          ? JSON.stringify(event.output ?? {})
          : JSON.stringify(event.error ?? {});

    const toolInvocationContext: ToolInvocationContext<AgentState> = {
      runner: {
        state: this.config.state,
        abortSignal: this.abortController.signal,
      },
      toolCall: {
        callId: event.toolCallId,
        toolName: event.toolName,
        rawArgs,
        parsedArgs:
          event.type === 'tool-call'
            ? event.input
            : event.type === 'tool-result'
              ? event.output
              : event.error,
        metadata: {},
      },
    };

    toolModel.onRunnerToolEvent(event, contentStream, toolInvocationContext);
  }
}
