/**
 * UseAgentTool — Inter-agent communication.
 *
 * Allows an agent to call another agent owned by the same user.
 * Supports optional LLM-powered agent discovery when no agentId is specified.
 */
import { z } from 'zod';
import {
  ToolModel,
  type AgentState,
  type ToolExecuteContext,
  type ToolExecuteResult,
} from '../../agent/agent-library';
import { MCPClient, StreamableHTTPClientTransport } from '../../../services/mcp/mcp-client';
import { getRequestMetadata, type DevServerAppState } from '../../agent/agent-state';

const logger = console;

const UseAgentSchema = z.object({
  task: z
    .string()
    .describe(
      'A self-contained description of what you need done. Include all relevant context — the target agent cannot see your conversation history.',
    ),
  agentId: z
    .string()
    .optional()
    .describe('The ID of the agent to call. Omit to search for matching agents first.'),
  contextId: z
    .string()
    .optional()
    .describe(
      'Optional ID for multi-turn conversation continuity with the same target agent across multiple calls.',
    ),
});

type UseAgentInput = z.infer<typeof UseAgentSchema>;

export type UseAgentToolConfig = {
  platformBaseUrl: string;
  modelAccessKey: string;
  agentId: string;
};

export class UseAgentTool extends ToolModel<UseAgentInput> {
  #platformBaseUrl: string;
  #modelAccessKey: string;
  #agentId: string;

  constructor(config: UseAgentToolConfig) {
    super({
      name: 'useAgent',
      description:
        'Delegate a task to another specialized agent owned by this user.\n\n' +
        'Two-step workflow:\n' +
        '1. Search: Call with just a task (no agentId) to find agents that can handle it. Returns matching agents with descriptions.\n' +
        '2. Call: Call again with the chosen agentId to delegate the task and get a response.\n\n' +
        "Use when the user asks to call another agent, or when the task needs a specialization you don't have (e.g. a different language, domain expertise, or capability). Do not use for tasks you can handle yourself.",
      parametersSchema: UseAgentSchema,
      toolType: 'function',
      isStrict: false,
    });

    this.#platformBaseUrl = config.platformBaseUrl;
    this.#modelAccessKey = config.modelAccessKey;
    this.#agentId = config.agentId;
  }

  getComponentName(): string {
    return 'UseAgentStatus';
  }

  async execute(input: UseAgentInput, ctx: ToolExecuteContext): Promise<ToolExecuteResult> {
    const { task, agentId: targetAgentId, contextId } = input;

    // Read agent depth from request metadata
    const state = ctx.runner.state as AgentState<unknown, DevServerAppState>;
    const metadata = getRequestMetadata(state);
    const agentDepth = (metadata?.agentDepth as number) ?? 0;

    // Search mode: no agentId provided — discover matching agents
    if (!targetAgentId) {
      return this.searchAgents(task);
    }

    // Call mode: agentId provided — resolve and call the agent
    logger.info(
      `[UseAgentTool] Calling agent (target=${targetAgentId}, depth=${agentDepth}, contextId=${contextId || 'none'})`,
    );
    try {
      // Step 1: Resolve the target agent via the platform API
      const resolveResponse = await fetch(`${this.#platformBaseUrl}/api/agents/use-agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-key': this.#modelAccessKey,
        },
        body: JSON.stringify({
          task,
          agentId: targetAgentId,
          contextId,
          currentDepth: agentDepth,
        }),
      });

      if (!resolveResponse.ok) {
        const errorBody = await resolveResponse.json().catch(() => ({}));
        const errorMsg =
          (errorBody as { error?: string }).error || `HTTP ${resolveResponse.status}`;
        logger.warn(`[UseAgentTool] Agent resolution failed: ${errorMsg}`);
        return {
          output: `Failed to find or access the target agent: ${errorMsg}`,
          uiProps: { status: 'error', error: errorMsg },
        };
      }

      const resolved = (await resolveResponse.json()) as {
        agentId: string;
        agentName: string;
        agentType: string;
        agentUrl: string;
        bearerToken: string;
        sessionId: string;
        depth: number;
      };

      logger.info(
        `[UseAgentTool] Resolved agent: ${resolved.agentName} (${resolved.agentId}, type=${resolved.agentType})`,
      );

      // Step 2: Call the target agent's MCP endpoint
      const responseText = await this.callAgentMcp(
        resolved.agentUrl,
        resolved.bearerToken,
        resolved.sessionId,
        resolved.depth,
        task,
      );

      return {
        output: responseText,
        uiProps: {
          status: 'success',
          agentName: resolved.agentName,
          agentId: resolved.agentId,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[UseAgentTool] Error:`, error);
      return {
        output: `Error calling agent: ${errorMsg}`,
        uiProps: { status: 'error', error: errorMsg },
      };
    }
  }

  private async searchAgents(task: string): Promise<ToolExecuteResult> {
    logger.info(`[UseAgentTool] Searching for agents matching task`);

    try {
      const searchResponse = await fetch(`${this.#platformBaseUrl}/api/agents/use-agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-key': this.#modelAccessKey,
        },
        body: JSON.stringify({ task }),
      });

      if (!searchResponse.ok) {
        const errorBody = await searchResponse.json().catch(() => ({}));
        const errorMsg = (errorBody as { error?: string }).error || `HTTP ${searchResponse.status}`;
        logger.warn(`[UseAgentTool] Agent search failed: ${errorMsg}`);
        return {
          output: `Failed to search for agents: ${errorMsg}`,
          uiProps: { status: 'error', error: errorMsg },
        };
      }

      const { matches } = (await searchResponse.json()) as {
        matches: Array<{ agentId: string; name: string; reasoning: string }>;
      };

      if (matches.length === 0) {
        return {
          output: 'No agents found that match this task.',
          uiProps: { status: 'no_matches' },
        };
      }

      const lines = matches.map(
        (m, i) => `${i + 1}. "${m.name}" (id: ${m.agentId}) — ${m.reasoning}`,
      );

      const output =
        `Found ${matches.length} agent(s) that could handle this task:\n` +
        lines.join('\n') +
        "\n\nTo delegate, call this tool again with the chosen agent's ID.";

      return {
        output,
        uiProps: { status: 'search_results', matches },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[UseAgentTool] Search error:`, error);
      return {
        output: `Error searching for agents: ${errorMsg}`,
        uiProps: { status: 'error', error: errorMsg },
      };
    }
  }

  private async callAgentMcp(
    agentUrl: string,
    bearerToken: string,
    sessionId: string,
    depth: number,
    task: string,
  ): Promise<string> {
    const mcpUrl = new URL('/mcp', agentUrl);
    logger.debug(`[UseAgentTool] MCP URL: ${mcpUrl.toString()}`);
    const transport = new StreamableHTTPClientTransport(mcpUrl, {
      requestInit: {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'x-agent-depth': String(depth),
        },
      },
    });

    const client = new MCPClient(
      { name: 'use-agent-tool', version: '1.0.0' },
      { capabilities: {} },
    );

    try {
      logger.debug('[UseAgentTool] Connecting to MCP server...');
      await client.connect(transport);

      logger.debug('[UseAgentTool] Calling tool: askAgent');
      const result = await client.callTool({
        name: 'askAgent',
        arguments: { message: task, sessionId },
      });
      logger.info(
        `[UseAgentTool] Tool call completed, content items: ${Array.isArray(result.content) ? result.content.length : 0}`,
      );
      // Extract text from MCP response
      const content = Array.isArray(result.content) ? result.content : [];
      const textContent = content
        .filter(
          (item: { type?: string; text?: string }) =>
            item.type === 'text' && typeof item.text === 'string',
        )
        .map((item: { text?: string }) => item.text as string)
        .join('\n');

      return textContent || '(no response from agent)';
    } finally {
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}
