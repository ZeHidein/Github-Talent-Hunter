import {
  ToolLoopAgent,
  Output,
  hasToolCall,
  stepCountIs,
  type SystemModelMessage,
  type LanguageModelUsage,
} from 'ai';
import type {
  AgentRunner,
  AgentRunnerHandle,
  AgentRunnerRunOptions,
  AgentStreamEvent,
} from './agent-runner.ts';
import { generateShortId } from '../types/id.ts';
import { getAgentLogger } from '../types/logger.ts';
import { buildToolSet } from './tool-loop-agent/tool-loop-agent.tools.ts';

const logger = getAgentLogger();

export class ToolLoopAgentRunner implements AgentRunner {
  async runStream(options: AgentRunnerRunOptions): Promise<AgentRunnerHandle> {
    const tools = buildToolSet(options);
    const stopWhen =
      options.stopAtToolNames && options.stopAtToolNames.length > 0
        ? options.stopAtToolNames.map((t) => hasToolCall(t))
        : stepCountIs(options.maxSteps);

    const createOutput = (schema: any) => Output.object({ schema });
    const output = options.structuredOutputSchema
      ? createOutput(options.structuredOutputSchema)
      : undefined;

    const instructionsIdx = options.messages.findIndex((m) => m.role === 'system');

    const hasSystemInstructions = instructionsIdx !== -1;
    const systemInstructions = hasSystemInstructions
      ? (options.messages[instructionsIdx] as SystemModelMessage)
      : undefined;

    const messagesForStream = hasSystemInstructions
      ? options.messages.filter((m) => m.role !== 'system')
      : options.messages;

    let resolveOnFinish: () => void;
    const onFinishPromise = new Promise<void>((resolve) => {
      resolveOnFinish = resolve;
    });

    const agent = new ToolLoopAgent({
      model: options.model,
      ...(systemInstructions ? { instructions: systemInstructions } : {}),
      tools,
      stopWhen,
      output,
      onStepFinish: ({ response }) => {
        const messages = response.messages;
        if (messages.length > 0) {
          options.onStepMessages?.(messages);
        }
      },
      onFinish: ({ totalUsage }) => {
        if (totalUsage) {
          options.appState.setLastUsage?.(totalUsage);
        }
        resolveOnFinish();
      },
      prepareCall: ({ ...settings }) => ({
        ...settings,
        temperature: options.modelSettings?.temperature,
        maxOutputTokens: options.modelSettings?.maxOutputTokens,
        providerOptions: options.modelSettings?.providerOptions,
      }),
    });

    options.appState?.setRunnerState(agent as unknown);

    const res = await agent.stream({
      messages: messagesForStream,
      abortSignal: options.abortSignal,
    });

    let firstStreamError: unknown | null = null;

    let resolveDone!: (value: { structuredOutput?: unknown; stopReason?: 'max-steps' }) => void;
    const donePromise = new Promise<{ structuredOutput?: unknown; stopReason?: 'max-steps' }>(
      (resolve) => {
        resolveDone = resolve;
      },
    );

    let stepCount = 0;
    let stepPrefix = generateShortId(4);
    let partSeq = 0;
    const makeMessageId = (partId: string) => `${stepPrefix}:${partId}`;
    let didCallOnEnd = false;

    // State for merging consecutive text/reasoning content parts within a step.
    // The AI SDK may split a single logical text response into multiple content
    // parts with different IDs. We merge them only when text-end is immediately
    // followed by text-start (same for reasoning).
    let currentTextMessageId: string | null = null;
    let currentReasoningMessageId: string | null = null;
    let lastBoundaryType: string | null = null;

    // Guard with .catch() so a rejected `res.text` / `res.output` never
    // becomes an unhandled rejection when `onFinish` doesn't fire.
    const outputPromise = Promise.resolve(res)
      .then(async (finalResult: unknown) => {
        if (options.structuredOutputSchema && finalResult && 'output' in (finalResult as object)) {
          const structuredOutput = await Promise.resolve(
            (finalResult as { output?: unknown }).output,
          );
          return { structuredOutput, textOutput: undefined };
        }

        if (finalResult && 'text' in (finalResult as object)) {
          const textOutput = await Promise.resolve(
            (finalResult as { text?: PromiseLike<string> }).text,
          );
          return { structuredOutput: undefined, textOutput };
        }

        return { structuredOutput: undefined, textOutput: undefined };
      })
      .catch(() => {
        // Stream error already captured via firstStreamError; swallow here
        // to prevent unhandled rejection when onFinish never fires.
        return { structuredOutput: undefined, textOutput: undefined };
      });

    const events = (async function* (): AsyncIterable<AgentStreamEvent> {
      try {
        const streamParts: AsyncIterable<unknown> =
          'fullStream' in (res as object) &&
          (res as { fullStream?: AsyncIterable<unknown> }).fullStream
            ? (res as { fullStream: AsyncIterable<unknown> }).fullStream
            : (res as { textStream: AsyncIterable<string> }).textStream;

        for await (const part of streamParts) {
          if (typeof part === 'string') {
            yield { type: 'text-delta', messageId: makeMessageId('text'), textDelta: part };
            continue;
          }

          const typedPart = part as { type: string; [key: string]: unknown };

          if (typedPart.type === 'start-step') {
            stepCount += 1;
            stepPrefix = generateShortId(4);
            partSeq = 0;
            currentTextMessageId = null;
            currentReasoningMessageId = null;
            lastBoundaryType = null;
            yield { type: 'model-step-start', stepIndex: stepCount };
            continue;
          }

          if (typedPart.type === 'finish-step') {
            const usage = typedPart.usage as LanguageModelUsage | undefined;
            if (usage) {
              options.appState.setLastUsage?.(usage);
            }
            yield { type: 'model-step-end', stepIndex: stepCount, usage };
            continue;
          }

          if (typedPart.type === 'error') {
            firstStreamError = typedPart.error;
            yield { type: 'stream-error', error: typedPart.error };
            yield { type: 'finish' };
            return;
          }

          if (typedPart.type === 'text-start') {
            if (lastBoundaryType === 'text-end' && currentTextMessageId) {
              // Consecutive text parts (text-end → text-start) — reuse messageId to merge
            } else {
              currentTextMessageId = `${stepPrefix}:t${partSeq++}`;
            }
            lastBoundaryType = 'text-start';
            continue;
          }

          if (typedPart.type === 'text-end') {
            lastBoundaryType = 'text-end';
            continue;
          }

          if (typedPart.type === 'reasoning-start') {
            if (lastBoundaryType === 'reasoning-end' && currentReasoningMessageId) {
              // Consecutive reasoning parts (reasoning-end → reasoning-start) — reuse messageId
            } else {
              currentReasoningMessageId = `${stepPrefix}:r${partSeq++}`;
            }
            lastBoundaryType = 'reasoning-start';
            continue;
          }

          if (typedPart.type === 'reasoning-end') {
            lastBoundaryType = 'reasoning-end';
            continue;
          }

          if (typedPart.type === 'text-delta') {
            yield {
              type: 'text-delta',
              messageId: currentTextMessageId ?? makeMessageId(typedPart.id as string),
              textDelta: String(typedPart.text ?? ''),
            };
            continue;
          }

          if (typedPart.type === 'reasoning-delta') {
            yield {
              type: 'reasoning-delta',
              messageId: currentReasoningMessageId ?? makeMessageId(typedPart.id as string),
              textDelta: String(typedPart.text ?? ''),
            };
            continue;
          }

          if (typedPart.type === 'tool-input-start') {
            lastBoundaryType = null;
            yield {
              type: 'tool-input-start',
              toolCallId: String(typedPart.id ?? ''),
              toolName: String(typedPart.toolName ?? ''),
            };
            continue;
          }

          if (typedPart.type === 'tool-input-delta') {
            yield {
              type: 'tool-input-delta',
              toolCallId: String(typedPart.id ?? ''),
              delta: String(typedPart.delta ?? ''),
            };
            continue;
          }

          if (typedPart.type === 'tool-input-end') {
            yield { type: 'tool-input-end', toolCallId: String(typedPart.id ?? '') };
            continue;
          }

          if (typedPart.type === 'tool-call') {
            yield {
              type: 'tool-call',
              toolCallId: String(typedPart.toolCallId ?? ''),
              toolName: String(typedPart.toolName ?? ''),
              input: typedPart.input,
            };
            continue;
          }

          if (typedPart.type === 'tool-result') {
            yield {
              type: 'tool-result',
              toolCallId: String(typedPart.toolCallId ?? ''),
              toolName: String(typedPart.toolName ?? ''),
              output: typedPart.output,
            };
            continue;
          }

          if (typedPart.type === 'tool-error') {
            yield {
              type: 'tool-error',
              toolCallId: String(typedPart.toolCallId ?? ''),
              toolName: String(typedPart.toolName ?? ''),
              error: typedPart.error,
            };
            continue;
          }

          if (typedPart.type === 'finish') {
            if (!didCallOnEnd) {
              didCallOnEnd = true;
              options.onEnd?.();
            }
            yield { type: 'finish' };
          }
        }
      } catch (error) {
        logger.error('[ToolLoopAgentRunner] Stream error', { error });
        firstStreamError = firstStreamError ?? error;
        yield { type: 'stream-error', error };
        yield { type: 'finish' };
      } finally {
        if (!didCallOnEnd) {
          didCallOnEnd = true;
          options.onEnd?.();
        }
        // If an error occurred before onFinish fired, the happy-path chain
        // will never resolve donePromise. Resolve it here as a fallback
        // so `done` always settles.
        resolveDone({ structuredOutput: undefined, stopReason: undefined });
      }
    })();

    void onFinishPromise
      .then(() => outputPromise)
      .then(({ structuredOutput }) => {
        const stopReason: 'max-steps' | undefined =
          (!options.stopAtToolNames || options.stopAtToolNames.length === 0) &&
          stepCount >= options.maxSteps
            ? 'max-steps'
            : undefined;
        resolveDone({ structuredOutput, stopReason });
      })
      .catch(() => {
        // If onFinish chain fails, resolve with empty — error already in stream-error event.
        resolveDone({ structuredOutput: undefined, stopReason: undefined });
      });

    return { events, done: donePromise };
  }
}
