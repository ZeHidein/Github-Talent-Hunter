import { WebSocketServer, type WebSocket } from 'ws';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';

import { WebSocketServerAdapter } from '../../vendor/agentplace-transport/adapters/WebSocketServerAdapter';
import { RpcPeer } from '../../vendor/agentplace-transport/RpcPeer';
import { SessionManager } from './session-manager';
import type { AgentSession } from './agent-session';
import type { ComponentConfig } from './agent-session.types';
import type { DependencyContainer } from '../container';
import { MessageProcessor } from './message-processor';
import { extractSessionIdentity } from '../sdk/session-id';
import { createCallerFactory, createTRPCContext } from '../trpc/init';
import type { AppRouter } from '../trpc/router';
import type { AgentStorageFactoryService } from '../services/agent-storage-factory.service';
import { ActionLog } from '../bl/action-log/action-log';

export interface WebSocketHandlerOptions {
  httpServer: Server;
  container: DependencyContainer;
  sessionManager?: SessionManager;
  sessionTtlMs?: number;
  appRouter?: AppRouter;
  storageFactory?: AgentStorageFactoryService;
}

/**
 * Creates and manages WebSocket connections for the agent dev server
 */
export function createWebSocketHandler(options: WebSocketHandlerOptions): {
  sessionManager: SessionManager;
  shutdown: () => void;
} {
  const {
    httpServer,
    container,
    sessionTtlMs = 60 * 60 * 1000,
    appRouter,
    storageFactory,
  } = options;

  // Create tRPC caller factory if router is provided (for WS-based tRPC invocation)
  const trpcCallerFactory = appRouter ? createCallerFactory(appRouter) : null;

  // Use provided sessionManager or create a new one
  const sessionManager = options.sessionManager ?? new SessionManager({ ttlMs: sessionTtlMs });
  if (!options.sessionManager) {
    sessionManager.startCleanup();
  }

  const messageProcessor = new MessageProcessor({ container });

  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
  });

  console.log(
    JSON.stringify({
      level: 'info',
      timestamp: new Date().toISOString(),
      event: 'websocket.server.created',
      path: '/ws',
    }),
  );

  wss.on('connection', (ws: WebSocket, req) => {
    handleConnection(ws, req).catch((error) => {
      console.error('Error handling WebSocket connection:', error);
      ws.close(1011, 'Internal error');
    });
  });

  function log(level: 'info' | 'warn' | 'error', data: Record<string, unknown>) {
    const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    logFn(JSON.stringify({ level, timestamp: new Date().toISOString(), ...data }));
  }

  async function handleConnection(ws: WebSocket, req: any) {
    const adapter = new WebSocketServerAdapter(ws); // heartbeat built-in
    const rpcPeer = new RpcPeer(adapter);
    const connectionId = randomUUID();

    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const querySessionId = url.searchParams.get('agent_session_id');

    // Extract identity from request headers (X-User-Id injected by gateway)
    const identity = extractSessionIdentity(req);
    const sessionKey = querySessionId || identity.sessionId;
    const userId = identity.userId;
    const configId = identity.configId;

    // Get or create session using the agent session ID
    const session = await sessionManager.getOrCreate(sessionKey, {
      userId,
      configId,
    });

    // Add client to session
    session.addClient(connectionId, { connectionId, rpcPeer, ws });

    log('info', {
      event: 'client.connected',
      sessionKey,
      userId,
      configId,
      connectionId,
      clientCount: session.clientCount,
    });

    // Send session.joined notification
    rpcPeer
      .notify(
        {
          method: 'session.joined',
          params: { sessionKey, status: session.status, contentSeq: session.contentSeq },
        },
        { requireAck: false },
      )
      .catch(() => {});

    // Handle RPC requests
    rpcPeer.onMessage<{ method: string; [key: string]: unknown }>(async (p) => {
      log('info', {
        event: 'message.received',
        sessionKey,
        method: p.method,
        connectionId,
      });

      try {
        switch (p.method) {
          case 'message.send':
            return messageProcessor.handleMessageSend(rpcPeer, connectionId, session, p);
          case 'message.abort':
            return messageProcessor.handleMessageAbort(session, p);
          case 'content.resume':
            return handleContentResume(session, p);
          case 'session.info':
            return session.getInfo();
          case 'components.register':
            return handleComponentsRegister(session, p);
          case 'trpc':
            return handleTrpcCall(session, p);
          default:
            throw new Error(`Method not found: ${p.method}`);
        }
      } catch (error) {
        log('error', {
          event: 'handler.error',
          sessionKey,
          method: p.method,
          connectionId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    });

    // Handle close — use adapter.onClose() to avoid adding extra raw ws listeners.
    // Errors on the ws are already logged by the adapter and always trigger close.
    adapter.onClose((code, reason) => {
      session.removeClient(connectionId);
      log('info', {
        event: 'client.disconnected',
        sessionKey,
        connectionId,
        clientCount: session.clientCount,
        closeCode: code,
        closeReason: reason,
      });
    });
  }

  // Handler for tRPC calls over WebSocket — uses createCallerFactory for programmatic invocation
  async function handleTrpcCall(session: AgentSession, params: Record<string, unknown>) {
    if (!trpcCallerFactory || !storageFactory) {
      throw new Error('tRPC not configured on this server');
    }

    const { path, type, input } = params as {
      path: string;
      type: 'query' | 'mutation';
      input: unknown;
    };

    if (!path || !type) {
      throw new Error('Invalid tRPC call: missing path or type');
    }

    const ctx = createTRPCContext({
      sessionKey: session.sessionKey,
      actionLog: session.actionLog ?? new ActionLog(),
      storageFactory,
      session,
    });

    const caller = trpcCallerFactory(ctx);

    // Traverse the caller by path parts (e.g., 'platform.settings' → caller.platform.settings)
    const parts = path.split('.');
    let current: any = caller;
    for (const part of parts) {
      current = current[part];
      if (current === undefined) {
        throw new Error(`tRPC path not found: ${path} (failed at '${part}')`);
      }
    }

    // current is now the procedure — invoke it
    if (typeof current !== 'function') {
      throw new Error(`tRPC path is not a procedure: ${path} (type: ${typeof current})`);
    }

    return current(input);
  }

  // Handler for content.resume - returns stored content directly
  async function handleContentResume(session: AgentSession, params: Record<string, unknown>) {
    const afterSeq = (params.afterSeq as number) ?? 0;

    if (typeof afterSeq !== 'number' || afterSeq < 0) {
      throw new Error('Invalid afterSeq');
    }

    const oldestSeq = await session.getOldestContentSeq();
    let warning: string | undefined;
    let oldestAvailable: number | undefined;

    if (afterSeq > 0 && afterSeq < oldestSeq) {
      warning = 'Some content no longer available';
      oldestAvailable = oldestSeq;
    }

    // Get stored content (already final states, no streaming deltas)
    const contents = await session.getStoredContents(afterSeq);

    return {
      contents,
      replayed: contents.length,
      currentSeq: session.contentSeq,
      ...(warning && { warning, oldestAvailable }),
    };
  }

  // Handler for components.register - stores component configs for dynamic tool creation
  function handleComponentsRegister(session: AgentSession, params: Record<string, unknown>) {
    const components = (params.components ?? []) as ComponentConfig[];

    if (!Array.isArray(components)) {
      throw new Error('Invalid components array');
    }

    session.setComponentConfigs(components);

    log('info', {
      event: 'components.registered',
      sessionKey: session.sessionKey,
      count: components.length,
    });

    return { registered: components.length };
  }

  function shutdown() {
    console.log(
      JSON.stringify({
        level: 'info',
        timestamp: new Date().toISOString(),
        event: 'websocket.server.shutdown',
      }),
    );
    sessionManager.shutdown();
    wss.close();
  }

  return { sessionManager, shutdown };
}
