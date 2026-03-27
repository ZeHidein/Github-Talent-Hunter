import { createServer } from 'node:http';
import { DependencyContainer } from './container';
import { createWebSocketHandler, SessionManager } from './ws';
import { createRequestHandler } from './http/request-handler';
import { createPlatformRouter } from './trpc/routers/platform.router';
import { createAppRouter } from './trpc/router';

export class Server {
  private container: DependencyContainer;
  private httpServer: ReturnType<typeof createServer> | null = null;
  private wsShutdown: (() => void) | null = null;

  constructor() {
    this.container = DependencyContainer.getInstance();
  }

  async start() {
    console.log('[Server] Starting Agent Dev Server...');

    await this.container.setup();

    const sessionTtlMs = 24 * 60 * 60 * 1000;
    const sessionManager = new SessionManager({
      ttlMs: sessionTtlMs,
      onSessionCreated: async (session) => {
        console.log(`[Server] Session created: ${session.sessionKey}`);
      },
    });
    sessionManager.startCleanup();

    // Build tRPC routers once at startup
    const storageFactory = this.container.getAgentStorageFactoryService();
    const platformRouter = createPlatformRouter({ container: this.container, sessionManager });
    const appRouter = createAppRouter(platformRouter);

    // Create request handler — all HTTP routing lives inside
    const requestHandler = createRequestHandler({ sessionManager, container: this.container });

    this.httpServer = createServer(requestHandler);

    // Initialize WebSocket handler with tRPC router for WS-based procedure calls
    const { shutdown } = createWebSocketHandler({
      httpServer: this.httpServer,
      container: this.container,
      sessionManager,
      sessionTtlMs,
      appRouter,
      storageFactory,
    });
    this.wsShutdown = shutdown;

    const PORT = this.container.settings.getSecret('DEV_SERVER_PORT') || 8090;
    this.httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`[Server] HTTP server listening on port ${PORT}`);
      console.log(`[Server] WebSocket available at ws://0.0.0.0:${PORT}/ws`);
    });

    // Handle graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  private shutdown() {
    console.log('[Server] Shutting down...');
    this.container.getEventProcessor()?.stop();
    this.container.getAgentStateStore()?.disconnect();
    this.container.getStateConnection()?.close();
    if (this.wsShutdown) {
      this.wsShutdown();
    }
    if (this.httpServer) {
      this.httpServer.close(() => {
        console.log('[Server] HTTP server closed');
        process.exit(0);
      });
    }
  }
}
