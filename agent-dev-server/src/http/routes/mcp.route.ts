/**
 * MCP Server Route — exposes the agent as an MCP server.
 *
 * Handles POST/GET/DELETE on /mcp using the Streamable HTTP transport.
 * Registers 4 tools: askAgent, getConversationHistory, getAgentInfo, createSession.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

import type { SessionManager } from '../../ws/session-manager';
import type { DependencyContainer } from '../../container';
import type { Route } from './route';
import { getConfigId } from '../../util/config';
import {
  ContentType,
  isComponentDone,
  type AgentContent,
  type AgentStreamEvent,
  type TextContent,
  type ToolContent,
  type ComponentContent,
} from '../../bl/agent/agent-library';

const logger = console;

/**
 * MCP channel instruction suffix.
 * Tells the agent that this request comes from a programmatic MCP client,
 * so it should avoid UI components and respond with plain text / markdown only.
 */
const MCP_CHANNEL_INSTRUCTION = `

[Channel: MCP]
This message is coming from an MCP (Model Context Protocol) client — a programmatic interface, not a browser.
- Respond with plain text or markdown only.
- Do NOT use UI components (they cannot be rendered by the MCP client).
- Keep responses concise and structured.`;

/**
 * Serialize a ComponentContent to a readable text description.
 * MCP clients cannot render React components, so we produce a text fallback.
 */
function serializeComponent(content: ComponentContent): string {
  const name = content.componentName;
  const props = content.props;
  const streaming = content.streaming;

  let text = `[Component: ${name}]`;
  if (Object.keys(props).length > 0) {
    text += `\n${JSON.stringify(props, null, 2)}`;
  }
  if (streaming?.state === 'output-error' && streaming.error) {
    text += `\nError: ${streaming.error}`;
  }
  return text;
}

type McpRouteDeps = {
  sessionManager: SessionManager;
  container: DependencyContainer;
};

const MCP_METHODS = new Set(['POST', 'GET', 'DELETE']);

export function createMcpRoute(deps: McpRouteDeps): Route {
  const { sessionManager, container } = deps;
  const configId = getConfigId(container);
  const mcpServerName = container.settings.getSecret('AGENT_NAME') || configId;

  // Transport map: MCP session ID → transport
  const transports = new Map<string, StreamableHTTPServerTransport>();

  function createServer(agentDepth: number = 0): McpServer {
    const mcpServer = new McpServer(
      { name: mcpServerName, version: '1.0.0' },
      { capabilities: { tools: {} } },
    );

    registerTools(mcpServer, agentDepth);
    return mcpServer;
  }

  function registerTools(mcpServer: McpServer, agentDepth: number) {
    // 1. askAgent — send a message to the agent and get a response
    mcpServer.tool(
      'askAgent',
      'Send a message to the agent and get a response',
      {
        message: z.string().describe('The message to send to the agent'),
        sessionId: z.string().optional().describe('Session ID for conversation continuity'),
      },
      async ({ message, sessionId }) => {
        const sessionKey = sessionId ?? 'mcp-default';
        const session = await sessionManager.getOrCreate(sessionKey, {
          userId: 'mcp-user',
          configId,
        });

        const messagingService = container.createMessagingService();
        const conversationHistory = session.getConversationHistory() as unknown[];
        const baseInstruction = container.createInstructionService().getInstruction();

        // Augment instruction with MCP channel context
        const instruction = baseInstruction
          ? baseInstruction + MCP_CHANNEL_INSTRUCTION
          : MCP_CHANNEL_INSTRUCTION.trim();

        const result = await messagingService.sendMessage({
          configId,
          message: { type: 'TXT', content: message },
          instruction,
          conversationHistory,
          sessionKey,
          metadata: agentDepth > 0 ? { agentDepth } : undefined,
        });

        let responseText = '';
        const finishedComponents: ComponentContent[] = [];
        const toolResults: Array<{ toolName: string; output: unknown }> = [];

        const eventsDone = (async () => {
          for await (const event of result.events as AsyncIterable<AgentStreamEvent>) {
            if (event.type === 'tool-result') {
              toolResults.push({ toolName: event.toolName, output: event.output });
            }
          }
        })();

        for await (const content of result.stream as AsyncIterable<AgentContent>) {
          if (!content) continue;

          // Handle StateUpdate tool — update conversation history
          if (content.type === ContentType.Tool) {
            const toolContent = content as ToolContent;
            if (toolContent.tool.name === 'StateUpdate') {
              const stateData = toolContent.content as { conversationHistory?: unknown[] };
              if (stateData?.conversationHistory) {
                session.setConversationHistory(stateData.conversationHistory);
              }
              continue;
            }
          }

          // Accumulate text content — skip reasoning (chain-of-thought)
          if (content.type === ContentType.Text) {
            const textContent = content as TextContent;
            if (textContent.isReasoning) {
              session.pushContent(content);
              continue;
            }
            if (textContent.content) {
              responseText += textContent.content;
            }
          }

          // Collect finished components — only used as fallback if agent produces no text
          if (
            content.type === ContentType.Component &&
            isComponentDone(content as ComponentContent)
          ) {
            finishedComponents.push(content as ComponentContent);
          }

          // Store non-StateUpdate content
          session.pushContent(content);
        }

        await eventsDone;

        if (!responseText && finishedComponents.length > 0) {
          responseText = finishedComponents.map(serializeComponent).join('\n');
        }

        const content: Array<{ type: 'text'; text: string }> = [];
        content.push({ type: 'text' as const, text: responseText || '(no response)' });

        for (const { toolName, output } of toolResults) {
          const serialized = typeof output === 'string' ? output : JSON.stringify(output);
          content.push({
            type: 'text' as const,
            text: `[Tool Result: ${toolName}]\n${serialized}`,
          });
        }

        return { content };
      },
    );

    // 2. getConversationHistory — retrieve conversation history
    mcpServer.tool(
      'getConversationHistory',
      'Get conversation history from a session',
      {
        sessionId: z.string().optional().describe('Session ID (defaults to mcp-default)'),
        limit: z.number().optional().describe('Max number of history entries to return'),
      },
      async ({ sessionId, limit }) => {
        const session = sessionManager.get(sessionId ?? 'mcp-default');
        if (!session) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ history: [], message: 'No session found' }),
              },
            ],
          };
        }

        const history = session.getConversationHistory();
        const sliced = history.slice(-(limit ?? 50));

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ history: sliced, total: history.length }),
            },
          ],
        };
      },
    );

    // 3. getAgentInfo — get agent configuration info
    mcpServer.tool('getAgentInfo', 'Get information about this agent', {}, async () => {
      const instruction = container.createInstructionService().getInstruction();

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              configId,
              hasInstruction: !!instruction,
              instructionPreview: instruction ? instruction.slice(0, 200) : null,
            }),
          },
        ],
      };
    });

    // 4. createSession — create a new conversation session
    mcpServer.tool('createSession', 'Create a new conversation session', {}, async () => {
      const newSessionId = randomUUID();
      await sessionManager.getOrCreate(newSessionId, {
        userId: 'mcp-user',
        configId,
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ sessionId: newSessionId }) }],
      };
    });
  }

  return {
    matches: (method, url) => url === '/mcp' && MCP_METHODS.has(method),
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      const sessionId = (req.headers['mcp-session-id'] as string) ?? undefined;

      // DELETE — terminate session
      if (req.method === 'DELETE') {
        if (sessionId && transports.has(sessionId)) {
          const transport = transports.get(sessionId)!;
          await transport.close();
          transports.delete(sessionId);
        }
        res.writeHead(200);
        res.end();
        return;
      }

      // Reuse existing transport for known session
      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        return;
      }

      // New session — create transport + server
      const agentDepth = parseInt((req.headers['x-agent-depth'] as string) || '0', 10);

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) {
          transports.delete(sid);
          logger.info(`[MCP] Transport closed for session: ${sid}`);
        }
      };

      const server = createServer(agentDepth);
      await server.connect(transport);

      // Store transport by its generated session ID after connection
      await transport.handleRequest(req, res);

      const sid = transport.sessionId;
      if (sid) {
        transports.set(sid, transport);
        logger.info(`[MCP] New session created: ${sid}`);
      }
    },
  };
}
