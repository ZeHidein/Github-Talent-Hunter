import { messageDispatcher } from './lib/services/messageDispatcher';
messageDispatcher.initialize();

import ReactDOM from 'react-dom/client';

import '@bprogress/core/css';
import './index.css';

import { App } from './App';
import { buildContainer, type Container } from './container';
import { IframeChildAdapter } from '../../vendor/agentplace-transport/adapters/IframeAdapter';
import { RpcPeer, AgentMessageTypes } from '../../vendor/agentplace-transport/index';
import type {
  AgentAskMessage,
  AgentNotifyMessage,
  AgentHealthPingResponse,
} from '../../vendor/agentplace-transport/index';
import { AgentAuth } from './lib/agent-auth';
import { handleAgentMessageQuery } from './lib/rpc/agent-message-query';

declare global {
  interface Window {
    container: Container;
  }
}

async function main() {
  const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

  try {
    await AgentAuth.init();
    console.log('[Agent-Dev-Client] AgentAuth initialized');
  } catch (error) {
    console.error('[Agent-Dev-Client] Failed to initialize AgentAuth:', error);
  }

  const container = await buildContainer();
  window.container = container;

  root.render(<App container={container} />);

  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  const events = new EventSource('/events');
  events.addEventListener('reload', (e) => {
    window.location.reload();
  });

  // Initialize iframe transport (child side)
  console.log('[Agent-Dev-Client] Initializing iframe transport...');
  const transport = new IframeChildAdapter();
  const rpcPeer = new RpcPeer(transport);

  transport.on('connect', () => {
    console.log('[Agent-Dev-Client] ✅ Connected to admin-client via iframe transport!');
  });

  transport.on('disconnect', () => {
    console.log('[Agent-Dev-Client] ❌ Disconnected from admin-client');
  });

  // Handle incoming requests from admin-client (with response expected)
  rpcPeer.onMessage(async (payload: AgentAskMessage) => {
    console.log('[Agent-Dev-Client] Received request:', payload);

    // Handle ping for testing connectivity
    if (payload.type === AgentMessageTypes.AGENT_HEALTH_PING) {
      return { status: 'pong' } satisfies AgentHealthPingResponse;
    }

    // Handle agent.message.query: send message and wait for agent response
    if (payload.type === AgentMessageTypes.AGENT_MESSAGE_QUERY) {
      const queryPayload = payload as Extract<AgentAskMessage, { type: 'agent.message.query' }>;
      try {
        console.log('[Agent-Dev-Client] Processing agent.message.query:', queryPayload.message);
        const result = await handleAgentMessageQuery({ container, queryPayload });
        if (result.success) {
          console.log(
            '[Agent-Dev-Client] Agent responded with',
            result.responses.length,
            'messages',
          );
        }
        return result;
      } catch (error) {
        console.error('[Agent-Dev-Client] Error processing message:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return { status: 'unknown-command' };
  });

  // Handle incoming notifications from admin-client (fire-and-forget)
  rpcPeer.onNotify((payload: AgentNotifyMessage) => {
    console.log('[Agent-Dev-Client] Received notification:', payload);

    if (payload.type === AgentMessageTypes.AGENT_MESSAGE_SEND) {
      console.log('[Agent-Dev-Client] Processing agent.message.send:', payload.message);
      const messagesStore = container.messagesStore;
      if (messagesStore) {
        messagesStore.sendMessage({ instruction: payload.message });
        console.log('[Agent-Dev-Client] Message sent to agent:', payload.message);
      } else {
        console.error('[Agent-Dev-Client] Messages store not available');
      }
    }
  });

  // Expose rpcPeer globally for debugging
  (window as any).rpcPeer = rpcPeer;
}

main();
