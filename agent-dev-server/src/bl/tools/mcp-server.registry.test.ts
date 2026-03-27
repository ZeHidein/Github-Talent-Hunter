import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MCPServerRegistry, type MCPServerConfig } from './mcp-server.registry.ts';

type FakeClientCounters = {
  created: number;
  connected: number;
  listed: number;
  closed: number;
};

const createFakeClientFactory = (counters: FakeClientCounters) => {
  return (config: MCPServerConfig) => {
    counters.created += 1;

    return {
      async connect() {
        counters.connected += 1;
      },
      async listTools() {
        counters.listed += 1;
        return {
          tools: [
            {
              name: `${config.serverLabel}_tool`,
              description: `Tool for ${config.serverLabel}`,
              inputSchema: { type: 'object', properties: {} },
            },
          ],
        };
      },
      async close() {
        counters.closed += 1;
      },
      async callTool() {
        return { content: [{ type: 'text', text: 'ok' }] };
      },
    } as any;
  };
};

describe('MCPServerRegistry', () => {
  test('reuses cached tool descriptors and client connections when config is unchanged', async () => {
    const counters: FakeClientCounters = { created: 0, connected: 0, listed: 0, closed: 0 };
    const currentConfig = {
      github: {
        url: 'https://example.com/mcp',
        headers: { Authorization: 'Bearer token' },
      },
    };

    const registry = new MCPServerRegistry({
      loadEnabledServers: () => currentConfig,
      createClient: createFakeClientFactory(counters),
    });

    const firstTools = await registry.getAllTools();
    const secondTools = await registry.getAllTools();

    assert.equal(firstTools.length, 1);
    assert.equal(secondTools.length, 1);
    assert.equal(registry.getServerCount(), 1);
    assert.equal(counters.created, 1);
    assert.equal(counters.connected, 1);
    assert.equal(counters.listed, 1);
    // 1 pre-close from ensureConnected (cleans stale transport before connecting)
    assert.equal(counters.closed, 1);
  });

  test('invalidates the affected server when mcp config changes', async () => {
    const counters: FakeClientCounters = { created: 0, connected: 0, listed: 0, closed: 0 };
    let currentConfig = {
      github: {
        url: 'https://example.com/mcp',
      },
    };

    const registry = new MCPServerRegistry({
      loadEnabledServers: () => currentConfig,
      createClient: createFakeClientFactory(counters),
    });

    await registry.getAllTools();

    currentConfig = {
      github: {
        url: 'https://example.com/updated-mcp',
      },
    };

    const refreshedTools = await registry.getAllTools();

    assert.equal(refreshedTools.length, 1);
    assert.equal(counters.created, 2);
    assert.equal(counters.connected, 2);
    assert.equal(counters.listed, 2);
    // 1 pre-close (first connect) + 1 disconnect (reconcile) + 1 pre-close (second connect)
    assert.equal(counters.closed, 3);
  });

  test('shares in-flight discovery work across concurrent callers', async () => {
    const counters: FakeClientCounters = { created: 0, connected: 0, listed: 0, closed: 0 };
    const registry = new MCPServerRegistry({
      loadEnabledServers: () => ({
        github: {
          url: 'https://example.com/mcp',
        },
      }),
      createClient: createFakeClientFactory(counters),
    });

    const [firstTools, secondTools] = await Promise.all([
      registry.getAllTools(),
      registry.getAllTools(),
    ]);

    assert.equal(firstTools.length, 1);
    assert.equal(secondTools.length, 1);
    assert.equal(counters.created, 1);
    assert.equal(counters.connected, 1);
    assert.equal(counters.listed, 1);
  });
});
