/**
 * AnthropicWebSearchTool
 *
 * Provider-native Anthropic web search tool using webSearch_20250305.
 * This tool is executed by the Anthropic provider, not by our execute() method.
 */
import type { AnthropicProvider } from '@ai-sdk/anthropic';
import { z } from 'zod';
import type { Tool as AiSdkTool } from 'ai';
import { ToolModel, type ToolInvocationContext, type ToolCall } from '../../agent/agent-library';

const TOOL_NAME = 'web_search';

const webSearchParamsSchema = z.object({
  query: z
    .string()
    .describe(
      "Complete search query that fully captures the user's intent. Include ALL relevant details from the user's request.",
    ),
});

type WebSearchParams = z.infer<typeof webSearchParamsSchema>;

export interface AnthropicWebSearchToolConfig {
  /** Anthropic provider instance (already configured with gateway) */
  provider: AnthropicProvider;
  /** Maximum uses per request (default: 5) */
  maxUses?: number;
}

export class AnthropicWebSearchTool extends ToolModel<WebSearchParams> {
  private readonly tool: AiSdkTool<unknown, unknown>;

  constructor(config: AnthropicWebSearchToolConfig) {
    super({
      name: TOOL_NAME,
      toolType: 'web_search',
      description:
        'Search the web for current information. Use for real-time / up-to-date information.',
      parametersSchema: webSearchParamsSchema,
      isStreaming: true,
    });

    this.tool = config.provider.tools.webSearch_20250305({
      maxUses: config.maxUses ?? 5,
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
