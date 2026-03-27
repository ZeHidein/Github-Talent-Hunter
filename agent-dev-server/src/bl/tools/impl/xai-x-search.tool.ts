/**
 * XaiXSearchTool
 *
 * Provider-native xAI X/Twitter search tool using AI SDK provider tools.
 * Searches posts on X (Twitter) for real-time social media information.
 * This tool is executed by the xAI provider, not by our execute() method.
 */
import type { XaiProvider } from '@ai-sdk/xai';
import { z } from 'zod';
import type { Tool as AiSdkTool } from 'ai';
import { ToolModel, type ToolInvocationContext, type ToolCall } from '../../agent/agent-library';

export interface XaiXSearchToolConfig {
  /** xAI provider instance (already configured with gateway) */
  provider: XaiProvider;
}

const TOOL_NAME = 'x_search';

const xSearchParamsSchema = z.object({}).passthrough();

type XSearchParams = z.infer<typeof xSearchParamsSchema>;

export class XaiXSearchTool extends ToolModel<XSearchParams> {
  private readonly tool: AiSdkTool<unknown, unknown>;

  constructor(config: XaiXSearchToolConfig) {
    super({
      name: TOOL_NAME,
      toolType: 'web_search',
      description:
        'Search X (Twitter) posts for real-time social media information and discussions',
      parametersSchema: xSearchParamsSchema,
      isStreaming: true,
    });

    this.tool = config.provider.tools.xSearch() as unknown as AiSdkTool<unknown, unknown>;
  }

  override getAiSdkTool(): AiSdkTool<unknown, unknown> | null {
    return this.tool;
  }

  async call(
    _toolCall: ToolCall<XSearchParams>,
    _contentStream: { append: (content: unknown) => void },
    _ctx: ToolInvocationContext<unknown>,
  ): Promise<unknown> {
    return null;
  }
}
