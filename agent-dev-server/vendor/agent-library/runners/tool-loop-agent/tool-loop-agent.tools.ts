import { tool, type Tool, type ToolExecutionOptions } from 'ai';
import type { ToolResultOutput } from '@ai-sdk/provider-utils';
import type { AgentRunnerRunOptions } from '../agent-runner.ts';
import { getAgentLogger } from '../../types/logger.ts';
import type { ToolOutput } from '../../tools/tool-model.ts';
import {
  convertToolOutputToModelOutput,
  isBinaryToolOutput,
} from './tool-loop-agent.tool-output.ts';

const logger = getAgentLogger();

type NamedAiSdkTool = Tool & { name?: string; toolName?: string };

function getToolName(toolInstance: NamedAiSdkTool): string | null {
  if (typeof toolInstance.name === 'string' && toolInstance.name.length > 0) {
    return toolInstance.name;
  }
  if (typeof toolInstance.toolName === 'string' && toolInstance.toolName.length > 0) {
    return toolInstance.toolName;
  }
  return null;
}

export function buildToolSet(options: AgentRunnerRunOptions): Record<string, Tool> {
  const tools: Record<string, Tool> = {};

  for (const toolDefinition of options.tools) {
    if (toolDefinition.kind !== 'function') {
      continue;
    }
    if (tools[toolDefinition.name]) {
      logger.warn('[ToolLoopAgentRunner] Duplicate tool name', {
        toolName: toolDefinition.name,
        source: 'definition',
      });
      continue;
    }

    tools[toolDefinition.name] = tool({
      description: toolDefinition.description ?? '',
      inputSchema: toolDefinition.parameters,
      execute: async (args: unknown, toolOptions: ToolExecutionOptions): Promise<unknown> => {
        const rawArgs = JSON.stringify(args ?? {});
        return await options.executeTool({
          toolName: toolDefinition.name,
          toolCallId: toolOptions.toolCallId,
          input: args,
          rawArgs,
        });
      },
      toModelOutput: ({ output }: { output: unknown }): ToolResultOutput => {
        if (isBinaryToolOutput(output)) {
          return convertToolOutputToModelOutput(output as ToolOutput);
        }
        if (typeof output === 'string') {
          return { type: 'text', value: output };
        }
        return {
          type: 'json',
          value: JSON.parse(JSON.stringify(output ?? null)),
        };
      },
    });
  }

  for (const [toolName, toolInstance] of Object.entries(options.aiSdkToolset ?? {})) {
    if (tools[toolName]) {
      logger.warn('[ToolLoopAgentRunner] Duplicate tool name', {
        toolName,
        source: 'ai-sdk-toolset',
      });
      continue;
    }
    tools[toolName] = toolInstance;
  }

  if (options.aiSdkTools && options.aiSdkTools.length > 0) {
    logger.warn(
      '[ToolLoopAgentRunner] options.aiSdkTools is deprecated; prefer options.aiSdkToolset to preserve tool names',
    );
  }

  for (const toolInstance of options.aiSdkTools ?? []) {
    const toolName = getToolName(toolInstance as NamedAiSdkTool);
    if (!toolName) {
      logger.warn('[ToolLoopAgentRunner] Skipping AI SDK tool without name');
      continue;
    }
    if (tools[toolName]) {
      logger.warn('[ToolLoopAgentRunner] Duplicate tool name', {
        toolName,
        source: 'ai-sdk',
      });
      continue;
    }
    tools[toolName] = toolInstance;
  }

  return tools;
}
