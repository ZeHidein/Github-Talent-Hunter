/**
 * WebSearchToolModel
 *
 * Provider-native OpenAI web search tool using AI SDK provider tools.
 * This tool is executed by the OpenAI provider, not by our execute() method.
 */
import type { OpenAIProvider } from '@ai-sdk/openai';
import { z } from 'zod';
import type { Tool as AiSdkTool } from 'ai';
import {
  ToolModel,
  type ToolRunnerEvent,
  type ToolInvocationContext,
  type ToolCall,
} from '../../agent/agent-library';

export interface OpenAIWebSearchToolConfig {
  /** OpenAI provider instance (already configured with gateway) */
  provider: OpenAIProvider;
  /** Search context size (default: 'medium') */
  searchContextSize?: 'low' | 'medium' | 'high';
}

const TOOL_NAME = 'web_search';

const webSearchParamsSchema = z.object({}).passthrough();

type WebSearchParams = z.infer<typeof webSearchParamsSchema>;

export default class WebSearchToolModel extends ToolModel<WebSearchParams> {
  private readonly tool: AiSdkTool<unknown, unknown>;

  constructor(config: OpenAIWebSearchToolConfig) {
    super({
      name: TOOL_NAME,
      toolType: 'web_search',
      description: 'Search the web for current information',
      parametersSchema: webSearchParamsSchema,
      isStreaming: true,
    });

    this.tool = config.provider.tools.webSearch({
      searchContextSize: config.searchContextSize ?? 'medium',
    }) as unknown as AiSdkTool<unknown, unknown>;
  }

  override getAiSdkTool(): AiSdkTool<unknown, unknown> | null {
    return this.tool;
  }

  async call(
    _toolCall: ToolCall<WebSearchParams>,
    _contentStream: { append: (content: unknown) => void },
    _ctx: ToolInvocationContext<unknown>,
  ): Promise<unknown> {
    return null;
  }
}
