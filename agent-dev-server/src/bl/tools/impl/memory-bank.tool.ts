/**
 * PersistToMemoryBank Tool - Memorizes important user information
 *
 * This tool is used to save important information about the user that should
 * be remembered across conversations. The information is sent to the UI which
 * stores it in localStorage with a timestamp.
 *
 * Uses the agent-library execute() API.
 */
import { z } from 'zod';
import {
  ToolModel,
  type ToolExecuteContext,
  type ToolExecuteResult,
} from '../../agent/agent-library';

const PersistToMemoryBankSchema = z.object({
  summary: z
    .string()
    .describe(
      'A concise summary of the important information to remember about the user. ' +
        'Be specific and include relevant context. ' +
        'Examples: ' +
        '"User is looking for a mountain bike for trail riding", ' +
        '"User prefers concise responses", ' +
        '"User is planning a trip to Japan next month", ' +
        '"User is researching laptops for software development", ' +
        '"User has a dog named Max"',
    ),
});

type PersistToMemoryBankInput = z.infer<typeof PersistToMemoryBankSchema>;

const TOOL_NAME = 'persistToMemoryBank';

export class PersistToMemoryBankTool extends ToolModel<PersistToMemoryBankInput> {
  constructor() {
    super({
      name: TOOL_NAME,
      description:
        'Use this tool to memorize important information about the user that should be remembered for future conversations. ' +
        'This includes: ' +
        '1) User preferences and personal details they share. ' +
        '2) Current tasks, goals, or what the user is looking for (e.g., searching for a product, researching a topic). ' +
        '3) Important context that would be helpful to recall later or follow up on. ' +
        'Call this tool whenever the user shares significant information about themselves or their current objectives. ' +
        'IMPORTANT: If you need to call this tool, call it after all UI components to avoid blocking UI rendering.',
      parametersSchema: PersistToMemoryBankSchema,
      toolType: 'function',
      isStreaming: true,
      isStrict: false,
    });
  }

  async execute(
    input: PersistToMemoryBankInput,
    ctx: ToolExecuteContext,
  ): Promise<ToolExecuteResult> {
    return {
      output: `Memory saved: "${input.summary}"`,
      uiProps: {
        summary: input.summary,
      },
    };
  }
}
