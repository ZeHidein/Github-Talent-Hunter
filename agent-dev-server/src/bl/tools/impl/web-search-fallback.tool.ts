/**
 * WebSearchFallbackTool
 *
 * Fallback web search for providers that don't support native web search (e.g. Bedrock Claude).
 * Executes a separate generateText call to Anthropic API (via gateway) with web_search tool.
 */
import type { AnthropicProvider } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { z } from 'zod';
import {
  ToolModel,
  type ToolExecuteResult,
  type ToolExecuteContext,
} from '../../agent/agent-library';

const TOOL_NAME = 'web_search';

const webSearchParamsSchema = z.object({
  query_text: z
    .string()
    .describe(
      "Complete search query that fully captures the user's intent. Include ALL relevant details from the user's request.",
    ),
  allowed_domains: z
    .array(z.string())
    .optional()
    .describe(
      'Optional: Only include results from these domains (e.g., ["wikipedia.org", "github.com"]). Domains should not include HTTP/HTTPS scheme.',
    ),
  blocked_domains: z
    .array(z.string())
    .optional()
    .describe(
      'Optional: Never include results from these domains. Cannot be used together with allowed_domains.',
    ),
});

type WebSearchParams = z.infer<typeof webSearchParamsSchema>;

export interface WebSearchFallbackToolConfig {
  /** Anthropic provider instance (gateway-routed, used for the generateText sub-call) */
  provider: AnthropicProvider;
  /** Maximum web search uses per call (default: 5) */
  maxUses?: number;
}

export class WebSearchFallbackTool extends ToolModel<WebSearchParams> {
  private readonly provider: AnthropicProvider;
  private readonly maxUses: number;

  constructor(config: WebSearchFallbackToolConfig) {
    super({
      name: TOOL_NAME,
      toolType: 'function',
      description: `Search the web for ANY real-time or current information. YOU MUST USE THIS TOOL for:
- Current time, date, weather, or any time-sensitive information
- News, events, or anything that changes over time
- Prices, stock quotes, exchange rates
- Sports scores, election results, or live data
- Any question about "today", "now", "current", "latest", or "recent"
- Browsing specific URLs or websites
- Verifying facts or getting up-to-date information

Returns search results with relevant content and citations.`,
      parametersSchema: webSearchParamsSchema,
      isStreaming: true,
    });

    this.provider = config.provider;
    this.maxUses = config.maxUses ?? 5;
  }

  async execute(input: WebSearchParams, ctx: ToolExecuteContext): Promise<ToolExecuteResult> {
    const { query_text, allowed_domains, blocked_domains } = input;

    try {
      if (ctx.abortSignal?.aborted) {
        return { output: 'Web search canceled by user.' };
      }

      console.log(`[WebSearchFallbackTool] Executing search for query: "${query_text}"`);

      const webSearchConfig: Parameters<typeof this.provider.tools.webSearch_20250305>[0] = {
        maxUses: this.maxUses,
      };

      if (allowed_domains?.length) {
        webSearchConfig.allowedDomains = allowed_domains;
      } else if (blocked_domains?.length) {
        webSearchConfig.blockedDomains = blocked_domains;
      }

      const webSearchTool = this.provider.tools.webSearch_20250305(webSearchConfig);

      const result = await generateText({
        model: this.provider('claude-sonnet-4-6'),
        tools: { web_search: webSearchTool },
        toolChoice: 'required',
        maxOutputTokens: 4096,
        temperature: 0,
        abortSignal: ctx.abortSignal,
        prompt: `You are a web search assistant. Search the web for the following query and provide a comprehensive, accurate answer based on the search results.

Query: ${query_text}

Instructions:
- You MUST use the web_search tool - do not answer from memory
- Provide factual, well-organized responses based ONLY on search results
- Include citations with URLs for your sources
- If the search returns no results, indicate that clearly`,
      });

      return { output: result.text || 'No search results found.' };
    } catch (error) {
      console.error('[WebSearchFallbackTool] Error executing web search', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred during web search';
      return {
        output: `Web search failed: ${errorMessage}. Please try again or rephrase your query.`,
      };
    }
  }
}
