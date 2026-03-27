import { z } from 'zod';
import { ToolModel, type ToolExecuteResult, type ToolExecuteContext } from './tool-model.ts';
import { ContentType, type AgentContent, type ComponentContent } from '../types/content.ts';
import type { AgentFactory } from '../core/agent.factory.ts';
import AgentState from '../core/agent-state.ts';
import type { IToolRegistry } from './tool-registry.ts';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import { AgentMode } from '../types/mode.ts';
import { getAgentLogger } from '../types/logger.ts';
import type { KernelModelMiddleware } from '../kernel/middlewares/types.ts';

const logger = getAgentLogger();

/**
 * Configuration for a single subagent type.
 */
export interface SubagentConfig {
  /** Subagent type identifier (e.g. "explore") */
  type: string;
  /** Description shown to parent LLM in tool description */
  description: string;
  /** System prompt for the child agent */
  systemPrompt: string;
  /** Pre-built tool registry for the child agent */
  toolRegistry: IToolRegistry;
  /** Model for the child agent */
  model: LanguageModelV3;
  /** Max LLM calls for the child (safety limit) */
  maxModelCalls: number;
  /** Optional model middlewares (e.g. truncation) for the child agent */
  modelMiddlewares?: KernelModelMiddleware[];
  /** Model settings (maxOutputTokens, providerOptions with reasoning config, etc.) */
  modelSettings?: {
    temperature?: number;
    maxOutputTokens?: number;
    providerOptions?: ProviderOptions;
  };
  /** Trace name for observability (e.g. "Explore: agentId") */
  traceName?: string;
}

/**
 * Configuration for creating a SubagentToolModel.
 */
export interface SubagentToolConfig {
  /** Available subagent types */
  subagents: SubagentConfig[];
  /** Factory to create child agents */
  agentFactory: AgentFactory;
  /** Component name for UI rendering (default: 'Subagent') */
  componentName?: string;
}

/**
 * A specialized ToolModel that spawns child agents for delegated tasks.
 *
 * The parent LLM calls this tool with a task description and subagent type.
 * SubagentToolModel creates a child Agent, consumes its stream, counts tool calls,
 * reports progress via onProgress, and returns the child's text output.
 */
export class SubagentToolModel extends ToolModel<{ task: string; subagent: string }> {
  private readonly _componentName: string;
  private readonly subagentMap: Map<string, SubagentConfig>;
  private readonly agentFactory: AgentFactory;

  constructor(config: SubagentToolConfig) {
    const types = config.subagents.map((s) => s.type);
    if (types.length === 0) {
      throw new Error('SubagentToolModel requires at least one subagent config');
    }

    const subagentDescriptions = config.subagents
      .map((s) => `- "${s.type}": ${s.description}`)
      .join('\n');

    super({
      name: 'Subagent',
      description: `Delegate a task to a specialized subagent that runs independently and returns a summary.\n\nAvailable subagents:\n${subagentDescriptions}`,
      parametersSchema: z.object({
        task: z.string().describe('Clear, specific task description for the subagent'),
        subagent: z.enum(types as [string, ...string[]]).describe('Which subagent type to use'),
      }),
      toolType: 'function',
      isStreaming: true,
    });

    this._componentName = config.componentName ?? 'Subagent';
    this.agentFactory = config.agentFactory;
    this.subagentMap = new Map(config.subagents.map((s) => [s.type, s]));
  }

  getComponentName(): string {
    return this._componentName;
  }

  async execute(
    input: { task: string; subagent: string },
    ctx: ToolExecuteContext,
  ): Promise<ToolExecuteResult> {
    const subagentConfig = this.subagentMap.get(input.subagent);
    if (!subagentConfig) {
      return {
        output: `Unknown subagent type: "${input.subagent}"`,
        uiProps: { status: 'error', error: `Unknown subagent type: "${input.subagent}"` },
      };
    }

    const { task, subagent: subagentType } = input;

    // Emit initial progress
    ctx.onProgress?.({
      status: 'running',
      subagentType,
      task,
      toolCount: 0,
    });

    try {
      const parentState = ctx.runner.state as AgentState | undefined;
      const parentApp = parentState?.getApp?.();

      const agent = this.agentFactory.create({
        systemInstruction: subagentConfig.systemPrompt,
        toolRegistry: subagentConfig.toolRegistry,
        model: subagentConfig.model,
        limits: { maxModelCalls: subagentConfig.maxModelCalls },
        agentMode: AgentMode.Agent,
        modelMiddlewares: subagentConfig.modelMiddlewares,
        modelSettings: subagentConfig.modelSettings,
        state: AgentState.fromSnapshot(null, { app: parentApp }),
        traceName: subagentConfig.traceName,
      });

      const handle = await agent.runHandle({ query: task });

      // Consume the child's stream and count tool completions
      let toolCount = 0;
      let lastToolName: string | undefined;
      let resultText = '';

      // Sliding window of recent child tools (max 2)
      const MAX_RECENT = 2;
      type RecentTool = {
        toolCallId: string;
        componentName: string;
        props: Record<string, unknown>;
        state: string;
        toolName: string;
      };
      let recentTools: RecentTool[] = [];

      for await (const content of handle.stream as AsyncIterable<AgentContent>) {
        // Check abort
        if (ctx.abortSignal?.aborted) {
          handle.stream.abort();
          break;
        }

        if (content.type === ContentType.Text && !content.isReasoning) {
          resultText += content.content;
        }

        if (content.type === ContentType.Component) {
          const comp = content as ComponentContent;
          const tcId = comp.streaming?.toolCallId;
          const state = comp.streaming?.state;

          // Track from output-pending onwards (skip input-streaming/input-available)
          if (
            tcId &&
            (state === 'output-pending' || state === 'output-available' || state === 'output-error')
          ) {
            const entry: RecentTool = {
              toolCallId: tcId,
              componentName: comp.componentName,
              props: comp.props ?? {},
              state,
              toolName: comp.streaming?.toolName ?? comp.componentName,
            };

            const idx = recentTools.findIndex((t) => t.toolCallId === tcId);
            if (idx >= 0) {
              recentTools[idx] = entry;
            } else {
              recentTools.push(entry);
              if (recentTools.length > MAX_RECENT) {
                recentTools = recentTools.slice(-MAX_RECENT);
              }
            }

            if (state === 'output-available' || state === 'output-error') {
              toolCount++;
              lastToolName = comp.streaming?.toolName;
            }

            ctx.onProgress?.({
              status: 'running',
              subagentType,
              task,
              toolCount,
              lastToolName,
              recentTools: [...recentTools],
            });
          }
        }
      }

      // Wait for the agent to fully complete
      const outcome = await handle.done;

      const finalStatus = outcome.status === 'ok' ? 'completed' : 'error';
      const cappedResult =
        resultText.length > 2000 ? resultText.slice(0, 2000) + '...' : resultText;

      return {
        output: resultText || '(No text output from subagent)',
        uiProps: {
          status: finalStatus,
          subagentType,
          task,
          toolCount,
          resultText: cappedResult,
          ...(finalStatus === 'error' && {
            error: `Subagent ended with status: ${outcome.status}`,
          }),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[SubagentToolModel] Error running subagent', { error: errorMessage });

      return {
        output: `Subagent error: ${errorMessage}`,
        uiProps: {
          status: 'error',
          subagentType,
          task,
          toolCount: 0,
          error: errorMessage,
        },
      };
    }
  }
}

/**
 * Factory function to create a subagent tool.
 */
export function createSubagentTool(config: SubagentToolConfig): SubagentToolModel {
  return new SubagentToolModel(config);
}
