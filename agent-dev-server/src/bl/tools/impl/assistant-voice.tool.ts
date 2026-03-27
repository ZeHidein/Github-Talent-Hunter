/**
 * PlayVoiceAssistance Tool
 *
 * Provides voice response capability to user questions.
 * Uses the agent-library execute() API.
 */
import { z } from 'zod';
import {
  ToolModel,
  type ToolExecuteContext,
  type ToolExecuteResult,
} from '../../agent/agent-library';

const PlayVoiceAssistanceSchema = z.object({
  text: z.string().describe('Answer to user question'),
});

type PlayVoiceAssistanceInput = z.infer<typeof PlayVoiceAssistanceSchema>;

export class PlayVoiceAssistanceTool extends ToolModel<PlayVoiceAssistanceInput> {
  constructor() {
    super({
      name: 'playVoiceAssistance',
      description: 'API to provide voice response to user question',
      parametersSchema: PlayVoiceAssistanceSchema,
      toolType: 'function',
      isStrict: false,
    });
  }

  async execute(
    input: PlayVoiceAssistanceInput,
    ctx: ToolExecuteContext,
  ): Promise<ToolExecuteResult> {
    return {
      output: input.text ?? '',
      uiProps: {
        text: input.text,
      },
    };
  }
}
