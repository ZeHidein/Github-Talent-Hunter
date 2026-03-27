import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type RemoteMcpServerEntry = {
  url?: string;
  serverUrl?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  command?: string;
  args?: string[];
  enabled?: boolean;
  description?: string;
};

export type UiMcpConfig = {
  enabled?: boolean;
  description?: string;
};

export type McpConfigFile = {
  mcpServers?: Record<string, RemoteMcpServerEntry | UiMcpConfig>;
};

export type LoadedMcpConfig = {
  path?: string;
  mcpServers: Record<string, RemoteMcpServerEntry | UiMcpConfig>;
};

const MCP_CONFIG_RELATIVE_PATH = join('.agent', 'mcp.json');
const UI_MCP_KEY = 'ui';

function findMcpConfigPath(startDir: string): string | undefined {
  let current = startDir;
  while (true) {
    const candidate = join(current, MCP_CONFIG_RELATIVE_PATH);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export function loadMcpConfig(): LoadedMcpConfig {
  const agentTemplateRoot = join(__dirname, '..', '..', '..', '..', '..');
  const searchRoots = [process.cwd(), agentTemplateRoot];
  let path: string | undefined;
  for (const root of searchRoots) {
    path = findMcpConfigPath(root);
    if (path) {
      break;
    }
  }
  if (!path) {
    return { mcpServers: {} };
  }

  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as McpConfigFile;
    const mcpServers = parsed?.mcpServers ?? {};
    return { path, mcpServers };
  } catch (error) {
    console.warn('[MCPConfig] Failed to read mcp.json, skipping.', error);
    return { path, mcpServers: {} };
  }
}

export function getEnabledMcpServers(): Record<string, RemoteMcpServerEntry> {
  const { mcpServers } = loadMcpConfig();
  const enabledEntries: Record<string, RemoteMcpServerEntry> = {};

  for (const [label, config] of Object.entries(mcpServers)) {
    // Skip UI MCP (it's not a remote server)
    if (label === UI_MCP_KEY) {
      continue;
    }
    if (!config || (config as RemoteMcpServerEntry).enabled === false) {
      continue;
    }
    enabledEntries[label.toLowerCase()] = config as RemoteMcpServerEntry;
  }

  return enabledEntries;
}

/**
 * Check if UI MCP is enabled.
 * Controls all browser-based capabilities: UI components, voice assistance, and memory bank.
 */
export function isUiMcpEnabled(): boolean {
  const { mcpServers } = loadMcpConfig();
  const uiConfig = mcpServers[UI_MCP_KEY] as UiMcpConfig | undefined;

  // Enabled by default if ui config exists, or if no config at all
  if (!uiConfig) {
    return true;
  }
  return uiConfig.enabled !== false;
}
