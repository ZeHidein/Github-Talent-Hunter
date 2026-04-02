/**
 * ToolRegistryFactory
 *
 * Creates and configures tool registries for agent runs.
 * Uses agent-library ToolModel implementations.
 */
import { ToolRegistry } from '../tools/tool.registry';
import { PlayVoiceAssistanceTool } from '../tools/impl/assistant-voice.tool';
import WebSearchToolModel from '../tools/impl/web-search-tool.model';
import { WebSearchFallbackTool } from '../tools/impl/web-search-fallback.tool';
import { XaiWebSearchTool } from '../tools/impl/xai-web-search.tool';
import { XaiXSearchTool } from '../tools/impl/xai-x-search.tool';
import { PersistToMemoryBankTool } from '../tools/impl/memory-bank.tool';
import type { MCPServerRegistry } from '../tools/mcp-server.registry';
import NanoBananaToolModel from '../tools/impl/nanobanana-tool.model';
import type { ModelProvider } from '../agent/interfaces';
import { isUiMcpEnabled } from '../tools/mcp-config';
import { FilesystemTool } from '../tools/impl/filesystem.tool';
import type { AgentStorageFactoryService } from '../../services/agent-storage-factory.service';
import { PublicCdnUploadService } from '../../services/public-cdn-upload.service';
import { ComponentToolModel, type ToolParameters } from '../agent/agent-library';
import type { ComponentConfig } from '../../ws/agent-session.types';
import { jsonSchema } from '@ai-sdk/provider-utils';
import { UseAgentTool } from '../tools/impl/use-agent.tool';
import { SearchGitHubTalentTool } from '../tools/impl/github-talent.tool';
import { SaveKeywordsTool } from '../tools/impl/save-keywords.tool';
import { getJWTPayload } from '../../util/jwt';

export class ToolRegistryFactory {
  static async createToolRegistry(
    modelName: string,
    modelProvider: ModelProvider,
    storageFactory: AgentStorageFactoryService,
    mcpRegistry: MCPServerRegistry,
    componentConfigs: ComponentConfig[] = [],
  ): Promise<ToolRegistry> {
    const toolRegistry = new ToolRegistry();

    // Register filesystem tool (single tool with list/read/write actions)
    toolRegistry.registerTool(new FilesystemTool({ storageFactory }));

    // Register GitHub talent search tool
    toolRegistry.registerTool(new SearchGitHubTalentTool());

    // Register keywords saving tool
    toolRegistry.registerTool(new SaveKeywordsTool());
    // Register browser-based tools if UI MCP is enabled (voice and memory bank)
    if (isUiMcpEnabled()) {
      toolRegistry.registerTool(new PlayVoiceAssistanceTool());
      toolRegistry.registerTool(new PersistToMemoryBankTool());

      for (const config of componentConfigs) {
        const wrappedSchema = jsonSchema(config.parameters) as ToolParameters;
        toolRegistry.registerTool(
          new ComponentToolModel({
            name: config.name,
            description: config.description,
            schema: wrappedSchema,
            componentName: config.componentName,
            isStrict: config.isStrictSchema,
          }),
        );
      }
    }

    // Register tools for OpenAI models that support them
    if (modelName.startsWith('gpt') || modelName.startsWith('o3') || modelName.startsWith('o4')) {
      const openai = modelProvider.getOpenAIProvider?.();
      if (openai) {
        toolRegistry.registerTool(new WebSearchToolModel({ provider: openai }));
      }
    }

    // Bedrock doesn't support provider-native web search.
    // Fallback: separate generateText call to Anthropic API via gateway.
    if (modelName.startsWith('claude') || modelName.startsWith('global.anthropic.')) {
      const anthropic = modelProvider.getAnthropicProvider?.();
      if (anthropic) {
        toolRegistry.registerTool(new WebSearchFallbackTool({ provider: anthropic }));
      }
    }

    // Gemini doesn't support provider-native web search.
    // Fallback: separate generateText call to Anthropic API via gateway.
    if (modelName.startsWith('gemini')) {
      const anthropic = modelProvider.getAnthropicProvider?.();
      if (anthropic) {
        toolRegistry.registerTool(new WebSearchFallbackTool({ provider: anthropic }));
      }
    }

    // Register xAI tools for Grok models
    if (modelName.startsWith('grok')) {
      const xai = modelProvider.getXaiProvider?.();
      if (xai) {
        toolRegistry.registerTool(new XaiWebSearchTool({ provider: xai }));
        toolRegistry.registerTool(new XaiXSearchTool({ provider: xai }));
      }
    }

    const cdnUploadService = new PublicCdnUploadService({
      apiBaseUrl: storageFactory.getApiBaseUrl(),
      accessKey: storageFactory.getAccessKey(),
    });

    toolRegistry.registerTool(
      new NanoBananaToolModel({
        modelProvider,
        cdnUploadService,
      }),
    );

    // Register inter-agent communication tool
    try {
      const platformBaseUrl = storageFactory.getApiBaseUrl();
      const modelAccessKey = storageFactory.getAccessKey();
      const { agentId } = getJWTPayload<{ agentId: string }>(modelAccessKey);

      toolRegistry.registerTool(new UseAgentTool({ platformBaseUrl, modelAccessKey, agentId }));
    } catch (error) {
      console.warn('[ToolRegistryFactory] Failed to register UseAgentTool:', error);
    }

    // Register MCP server tools (loaded from mcp.json)
    await ToolRegistryFactory.registerMCPServerTools(toolRegistry, mcpRegistry);

    return toolRegistry;
  }

  private static async registerMCPServerTools(
    toolRegistry: ToolRegistry,
    mcpRegistry: MCPServerRegistry,
  ): Promise<void> {
    try {
      const mcpTools = await mcpRegistry.getAllTools();

      console.log(
        `[ToolRegistryFactory] Registering ${mcpTools.length} tools from ${mcpRegistry.getServerCount()} MCP servers`,
      );

      for (const tool of mcpTools) {
        toolRegistry.registerTool(tool);
      }

      console.log(`[ToolRegistryFactory] Successfully registered MCP server tools`);
    } catch (error) {
      console.error('[ToolRegistryFactory] Failed to register MCP server tools:', error);
      // Don't throw - agent should still work without MCP tools
    }
  }
}
