import { MCPToolModel, type MCPToolConfig } from './impl/mcp-tool-model';
import {
  MCPClient,
  SSEClientTransport,
  StreamableHTTPClientTransport,
} from '../../services/mcp/mcp-client';
import { getEnabledMcpServers, type RemoteMcpServerEntry } from './mcp-config';
const logger = console;

export interface MCPServerConfig {
  serverLabel: string;
  serverUrl: string;
  headers?: Record<string, string>;
}

interface MCPServerState {
  client: MCPClient;
  config: MCPServerConfig;
  configFingerprint: string;
  connected: boolean;
  toolDescriptors?: MCPToolConfig[];
}

interface MCPServerRegistryDeps {
  loadEnabledServers?: () => Record<string, RemoteMcpServerEntry>;
  createClient?: (config: MCPServerConfig) => MCPClient;
}

/**
 * MCPServerRegistry manages all MCP servers configured in .env.runtime
 * It's completely provider-agnostic - works with Composio, Zapier, custom servers, etc.
 *
 * Transport Implementation (Auto-Detection):
 * - Composio servers (*.composio.dev, *.composio.app) → StreamableHTTPClientTransport
 *   Composio requires "HTTP Stream" transport as documented at https://docs.composio.dev
 * - Other servers (Zapier, custom) → SSEClientTransport (default)
 *   SSE is the standard for most HTTP-based MCP servers
 * - StdioClientTransport is NOT used (only for local process-based servers)
 *
 * Transport is automatically selected based on server URL hostname pattern.
 */
export class MCPServerRegistry {
  private serverStates: Map<string, MCPServerState> = new Map();
  private configFingerprint = '';
  private initialized = false;
  private readonly loadEnabledServers: () => Record<string, RemoteMcpServerEntry>;
  private readonly createClient: (config: MCPServerConfig) => MCPClient;
  private reconciliationPromise: Promise<void> | null = null;
  private connectPromises = new Map<string, Promise<void>>();
  private toolDiscoveryPromises = new Map<string, Promise<MCPToolConfig[]>>();

  constructor(deps: MCPServerRegistryDeps = {}) {
    this.loadEnabledServers = deps.loadEnabledServers || getEnabledMcpServers;
    this.createClient =
      deps.createClient ||
      ((config) =>
        new MCPClient(
          { name: `agent-dev-server-${config.serverLabel}`, version: '1.0.0' },
          { capabilities: {} },
        ));
    logger.info('[MCPServerRegistry] Initialized');
  }

  /**
   * Load MCP server configurations from environment variables
   * Pattern: MCP_SERVER_{LABEL}_{URL|HEADERS_*}
   */
  async loadFromConfig(): Promise<void> {
    if (!this.reconciliationPromise) {
      this.reconciliationPromise = (async () => {
        const configs = this.getConfiguredServers();
        logger.info(`[MCPServerRegistry] Discovered ${configs.length} MCP servers in config`);
        await this.reconcileServers(configs);
        this.initialized = true;
        logger.info(
          `[MCPServerRegistry] Loaded ${this.serverStates.size} MCP servers from mcp.json`,
        );
      })().finally(() => {
        this.reconciliationPromise = null;
      });
    }

    await this.reconciliationPromise;
  }

  /**
   * Get all tools from all registered MCP servers
   */
  async getAllTools(): Promise<MCPToolModel[]> {
    await this.loadFromConfig();

    const allTools: MCPToolModel[] = [];

    for (const serverLabel of this.serverStates.keys()) {
      const tools = await this.getToolsForServer(serverLabel);
      allTools.push(...tools);
    }

    logger.info(`[MCPServerRegistry] Total tools available: ${allTools.length}`);
    return allTools;
  }

  /**
   * Get tools for a specific MCP server
   */
  async getToolsForServer(serverLabel: string): Promise<MCPToolModel[]> {
    await this.loadFromConfig();
    const state = this.serverStates.get(serverLabel);
    if (!state) {
      return [];
    }

    try {
      const toolDescriptors = await this.getToolDescriptorsForServer(serverLabel);
      return toolDescriptors.map(
        (tool) =>
          new MCPToolModel({
            mcpClient: state.client,
            serverLabel,
            tool,
          }),
      );
    } catch (error) {
      logger.error(`[MCPServerRegistry] Failed to load tools from ${serverLabel}:`, error);
      return [];
    }
  }

  private async getToolDescriptorsForServer(serverLabel: string): Promise<MCPToolConfig[]> {
    const state = this.serverStates.get(serverLabel);
    if (!state) {
      return [];
    }
    if (state.toolDescriptors) {
      return state.toolDescriptors;
    }

    const existingPromise = this.toolDiscoveryPromises.get(serverLabel);
    if (existingPromise) {
      return existingPromise;
    }

    const discoveryPromise = (async () => {
      await this.ensureConnected(state);
      const response = await state.client.listTools();
      const tools = response.tools || [];

      logger.info(`[MCPServerRegistry] Found ${tools.length} tools on MCP server: ${serverLabel}`);
      state.toolDescriptors = tools.map((tool: any) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema || { type: 'object', properties: {} },
      }));
      return state.toolDescriptors;
    })();

    this.toolDiscoveryPromises.set(serverLabel, discoveryPromise);

    try {
      return await discoveryPromise;
    } catch (error) {
      state.toolDescriptors = undefined;
      state.connected = false;
      logger.error(`[MCPServerRegistry] Failed to list tools from ${serverLabel}:`, error);
      throw error;
    } finally {
      this.toolDiscoveryPromises.delete(serverLabel);
    }
  }

  /**
   * Ensure MCP client is connected
   */
  private async ensureConnected(state: MCPServerState): Promise<void> {
    if (state.connected) {
      return;
    }

    const existingPromise = this.connectPromises.get(state.config.serverLabel);
    if (existingPromise) {
      return existingPromise;
    }

    const connectPromise = (async () => {
      // Close any stale transport from a previous failed connection
      try {
        await state.client.close();
      } catch {
        // ignore — client may not have been connected
      }

      const url = new URL(state.config.serverUrl);

      // Auto-detect transport type based on server URL
      // Composio uses StreamableHTTP (HTTP Stream), most others use SSE
      const transport = this.createTransport(url, state.config);

      await state.client.connect(transport);
      state.connected = true;
      logger.info(
        `[MCPServerRegistry] Connected to MCP server: ${state.config.serverLabel} (${url.hostname})`,
      );
    })();

    this.connectPromises.set(state.config.serverLabel, connectPromise);

    try {
      await connectPromise;
    } catch (error) {
      state.connected = false;
      logger.error(
        `[MCPServerRegistry] Failed to connect to MCP server ${state.config.serverLabel}:`,
        error,
      );
      throw error;
    } finally {
      this.connectPromises.delete(state.config.serverLabel);
    }
  }

  /**
   * Create appropriate transport based on server URL
   * Composio servers use StreamableHTTP, others default to SSE
   */
  private createTransport(
    url: URL,
    config: MCPServerConfig,
  ): SSEClientTransport | StreamableHTTPClientTransport {
    const requestInit = config.headers ? { headers: config.headers } : undefined;

    if (
      url.pathname.startsWith('/mcp/ext/') ||
      url.hostname.includes('composio.dev') ||
      url.hostname.includes('composio.app') ||
      url.hostname.includes('agentplace.io') ||
      url.hostname.includes('localhost') ||
      (url.hostname.includes('apollo') && url.hostname.includes('vercel.app'))
    ) {
      logger.info(`[MCPServerRegistry] Using StreamableHTTP transport for ${url.hostname}`);
      return new StreamableHTTPClientTransport(url, { requestInit });
    }

    // Default to SSE for other MCP servers (Zapier, custom servers)
    logger.info(`[MCPServerRegistry] Using SSE transport for ${url.hostname}`);
    return new SSEClientTransport(url, { requestInit });
  }

  /**
   * Clear tool cache
   */
  clearCache(): void {
    for (const state of this.serverStates.values()) {
      state.toolDescriptors = undefined;
    }
    this.toolDiscoveryPromises.clear();
    logger.debug('[MCPServerRegistry] Cleared tool cache');
  }

  /**
   * Disconnect all MCP clients
   */
  async disconnect(): Promise<void> {
    for (const [label, state] of this.serverStates.entries()) {
      try {
        await state.client.close();
        logger.info(`[MCPServerRegistry] Disconnected from ${label}`);
      } catch (error) {
        logger.error(`[MCPServerRegistry] Error disconnecting ${label}:`, error);
      }
    }
    this.serverStates.clear();
    this.configFingerprint = '';
    this.reconciliationPromise = null;
    this.connectPromises.clear();
    this.toolDiscoveryPromises.clear();
    this.initialized = false;
  }

  /**
   * Check if registry is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get number of registered servers
   */
  getServerCount(): number {
    return this.serverStates.size;
  }

  private getConfiguredServers(): MCPServerConfig[] {
    const configServers = this.loadEnabledServers();
    const serverEntries = Object.entries(configServers);
    const configs: MCPServerConfig[] = [];

    for (const [serverLabel, config] of serverEntries) {
      const serverUrl = config.url || config.serverUrl;

      if (!serverUrl) {
        logger.info(
          `[MCPServerRegistry] Skipping ${serverLabel} - no server URL provided in mcp.json`,
        );
        continue;
      }

      configs.push({
        serverLabel,
        serverUrl,
        headers:
          config.headers && Object.keys(config.headers).length > 0 ? config.headers : undefined,
      });
    }

    return configs.sort((a, b) => a.serverLabel.localeCompare(b.serverLabel));
  }

  private async reconcileServers(configs: MCPServerConfig[]): Promise<void> {
    const nextFingerprint = this.computeConfigFingerprint(configs);
    if (this.initialized && this.configFingerprint === nextFingerprint) {
      return;
    }

    const nextConfigs = new Map(configs.map((config) => [config.serverLabel, config]));

    for (const [serverLabel, state] of this.serverStates.entries()) {
      if (!nextConfigs.has(serverLabel)) {
        await this.disconnectState(serverLabel, state);
      }
    }

    for (const config of configs) {
      const existing = this.serverStates.get(config.serverLabel);
      const nextStateFingerprint = this.computeServerFingerprint(config);

      if (!existing) {
        this.serverStates.set(config.serverLabel, this.createServerState(config));
        logger.info(
          `[MCPServerRegistry] Registered MCP server: ${config.serverLabel} (${config.serverUrl})`,
        );
        continue;
      }

      if (existing.configFingerprint !== nextStateFingerprint) {
        await this.disconnectState(config.serverLabel, existing);
        this.serverStates.set(config.serverLabel, this.createServerState(config));
        logger.info(
          `[MCPServerRegistry] Reconfigured MCP server: ${config.serverLabel} (${config.serverUrl})`,
        );
      }
    }

    this.configFingerprint = nextFingerprint;
  }

  private createServerState(config: MCPServerConfig): MCPServerState {
    return {
      client: this.createClient(config),
      config,
      configFingerprint: this.computeServerFingerprint(config),
      connected: false,
      toolDescriptors: undefined,
    };
  }

  private async disconnectState(serverLabel: string, state: MCPServerState): Promise<void> {
    try {
      await state.client.close();
    } catch (error) {
      logger.error(`[MCPServerRegistry] Error disconnecting ${serverLabel}:`, error);
    } finally {
      this.serverStates.delete(serverLabel);
      this.connectPromises.delete(serverLabel);
      this.toolDiscoveryPromises.delete(serverLabel);
    }
  }

  private computeConfigFingerprint(configs: MCPServerConfig[]): string {
    return JSON.stringify(
      configs.map((config) => ({
        serverLabel: config.serverLabel,
        serverUrl: config.serverUrl,
        headers: this.sortRecord(config.headers),
      })),
    );
  }

  private computeServerFingerprint(config: MCPServerConfig): string {
    return JSON.stringify({
      serverLabel: config.serverLabel,
      serverUrl: config.serverUrl,
      headers: this.sortRecord(config.headers),
    });
  }

  private sortRecord(record?: Record<string, string>): Record<string, string> | undefined {
    if (!record) {
      return undefined;
    }

    return Object.fromEntries(
      Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
    );
  }
}
