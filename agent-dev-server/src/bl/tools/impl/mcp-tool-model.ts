/**
 * MCPToolModel
 *
 * Wraps a single MCP tool and provides model-agnostic execution.
 * Works with any LLM (OpenAI, Anthropic, xAI, etc.) and any MCP server.
 * Uses the agent-library execute() API.
 */
import {
  ToolModel,
  type ToolExecuteContext,
  type ToolExecuteResult,
} from '../../agent/agent-library';
import { jsonSchema } from '@ai-sdk/provider-utils';
import type { JSONSchema7 } from '@ai-sdk/provider';
import type { MCPClient } from '../../../services/mcp/mcp-client';

const logger = console;

export interface MCPToolConfig {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * MCPToolModel wraps a single MCP tool and provides model-agnostic execution
 * Works with any LLM (OpenAI, Anthropic, xAI, etc.) and any MCP server
 */
export class MCPToolModel extends ToolModel<Record<string, unknown>> {
  private mcpClient: MCPClient;
  private serverLabel: string;
  private tool: MCPToolConfig;
  private rawInputSchema: Record<string, unknown>;

  constructor(config: {
    mcpClient: MCPClient;
    serverLabel: string;
    tool: MCPToolConfig;
  }) {
    const wrappedSchema = jsonSchema(config.tool.inputSchema) as JSONSchema7;

    super({
      toolType: 'function',
      name: config.tool.name,
      description: config.tool.description,
      parametersSchema: wrappedSchema,
      isStrict: false,
      isStreaming: false,
      requiresAgenticFeedback: false,
    });

    this.mcpClient = config.mcpClient;
    this.serverLabel = config.serverLabel;
    this.tool = config.tool;
    this.rawInputSchema = config.tool.inputSchema;
  }

  async execute(
    input: Record<string, unknown>,
    ctx: ToolExecuteContext,
  ): Promise<ToolExecuteResult> {
    logger.info(`[MCPToolModel] Executing ${this.tool.name} on server ${this.serverLabel}`);
    logger.debug(`[MCPToolModel] Arguments:`, input);

    try {
      // Execute tool via MCP protocol
      const result = await this.mcpClient.callTool({
        name: this.tool.name,
        arguments: input,
      });

      logger.info(`[MCPToolModel] Successfully executed ${this.tool.name}`);
      logger.debug(`[MCPToolModel] Result:`, result);

      // Return the content from MCP response
      // MCP returns { content: [...], isError?: boolean }
      if (result.isError) {
        throw new Error(`Tool execution failed: ${JSON.stringify(result.content)}`);
      }

      // Extract text content from MCP response
      const content = Array.isArray(result.content) ? result.content : [];
      const textContent = content
        .filter((item) => item.type === 'text' && typeof item.text === 'string')
        .map((item) => item.text as string)
        .join('\n');

      return {
        output: textContent || JSON.stringify(result.content),
        uiProps: {
          toolName: this.tool.name,
          status: 'success',
        },
      };
    } catch (error) {
      logger.error(`[MCPToolModel] Error executing ${this.tool.name}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Re-throw to let the kernel handle the error
      throw new Error(`Failed to execute ${this.tool.name}: ${errorMessage}`);
    }
  }

  /**
   * Override getParameters to return the raw JSON schema for legacy compatibility.
   */
  override getParameters(): Record<string, unknown> {
    return this.rawInputSchema;
  }

  override getComponentName(): string {
    return 'MCPToolStatus';
  }
}
