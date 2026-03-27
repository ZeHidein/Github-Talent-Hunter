/**
 * Server Tool Registry
 *
 * Extends agent-library's ToolRegistry with server-specific functionality.
 * This provides seamless integration with ToolLoopAgentRunner while
 * preserving backwards compatibility with existing tool registrations.
 */
import {
  ToolRegistry as BaseToolRegistry,
  type IToolRegistry,
  type ToolModel,
} from '../agent/agent-library';

export type { IToolRegistry };

export class ToolRegistry extends BaseToolRegistry {
  /**
   * Register multiple tools at once.
   * Convenience method for batch tool registration.
   */
  public registerTools(tools: ToolModel<unknown>[]): void {
    tools.forEach((tool) => {
      this.registerTool(tool);
    });
  }

  /**
   * Get tools in legacy LLM format.
   * @deprecated Use getAllAiSdkTools() for AI SDK format instead.
   */
  public getLlmTools(): { type: 'function'; function: any }[] {
    return this.getAllTools().map((tool) => ({
      type: 'function',
      function: {
        name: tool.getName(),
        description: tool.getDescription(),
        parameters: tool.getParameters(),
        strict: tool.isStrict,
      },
    }));
  }
}
