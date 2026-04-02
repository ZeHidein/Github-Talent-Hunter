/**
 * Save Keywords Tool
 *
 * Called by the orchestrator to save extracted keywords during conversation.
 * Keywords are stored server-side and displayed in the sidebar via tRPC.
 */
import { z } from 'zod';
import {
  ToolModel,
  type AgentState,
  type ToolExecuteContext,
  type ToolExecuteResult,
} from '../../agent/agent-library';
import { getSessionKey, type DevServerAppState } from '../../agent/agent-state';
import { addKeywords } from '../../../trpc/routers/keywords.router';

const SaveKeywordsSchema = z.object({
  keywords: z
    .array(
      z.object({
        text: z.string().describe('The keyword or phrase (e.g. "Kubernetes", "微服务架构", "React")'),
        category: z
          .string()
          .describe(
            'Category: "tech" (技术栈), "domain" (业务领域), "role" (岗位需求), "pain" (痛点), "culture" (文化特征)',
          ),
      }),
    )
    .describe('Array of keywords to save. Each keyword has text and category.'),
});

type SaveKeywordsInput = z.infer<typeof SaveKeywordsSchema>;

export class SaveKeywordsTool extends ToolModel<SaveKeywordsInput> {
  constructor() {
    super({
      name: 'saveKeywords',
      description:
        'Save keywords extracted from the conversation to the sidebar panel. Call this after each conversation turn to record key information about the company — technology stack, business domain, pain points, role needs, and culture traits. Keywords appear in the right sidebar where users can check/uncheck them. Duplicates are automatically filtered.',
      parametersSchema: SaveKeywordsSchema,
      toolType: 'function',
      isStrict: false,
    });
  }

  async execute(input: SaveKeywordsInput, ctx: ToolExecuteContext): Promise<ToolExecuteResult> {
    console.log('[SaveKeywords] Input:', JSON.stringify(input));

    try {
      const agentState = ctx.runner.state as AgentState<unknown, DevServerAppState>;
      const sessionKey = getSessionKey(agentState);

      if (!sessionKey) {
        console.warn('[SaveKeywords] No session key found');
        return { output: 'Error: No session key available.' };
      }

      const updated = addKeywords(sessionKey, input.keywords);

      const summary = input.keywords.map((k) => `${k.text} [${k.category}]`).join(', ');
      console.log('[SaveKeywords] Output: Saved', input.keywords.length, 'keywords. Total:', updated.length);

      return {
        output: `Saved ${input.keywords.length} keywords: ${summary}. Total keywords: ${updated.length}.`,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error('[SaveKeywords] Error:', errMsg);
      return { output: `Error saving keywords: ${errMsg}` };
    }
  }
}
