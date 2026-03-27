import type { IncomingMessage, ServerResponse } from 'node:http';
import { compose } from './middleware/compose';
import { corsMiddleware } from './middleware/cors.middleware';
import { compressionMiddleware } from './middleware/compression.middleware';
import { createHealthRoute } from './routes/health.route';
import { createConversationHistoryRoute } from './routes/conversation-history.route';
import { createMcpRoute } from './routes/mcp.route';
import { createOAuthMetadataRoute } from './routes/oauth-metadata.route';
import { createSessionSnapshotRoute } from './routes/session-snapshot.route';
import { createImportSessionRoute } from './routes/import-session.route';
import { createSendMessageRoute } from './routes/send-message.route';
import { serveStatic } from './static-files';
import type { Route } from './routes/route';
import type { SessionManager } from '../ws/session-manager';
import type { DependencyContainer } from '../container';

type Deps = {
  sessionManager: SessionManager;
  container: DependencyContainer;
};

export function createRequestHandler(deps: Deps) {
  const { sessionManager, container } = deps;

  const routes: Route[] = [
    createHealthRoute(),
    createConversationHistoryRoute(sessionManager),
    createOAuthMetadataRoute(),
    createMcpRoute({ sessionManager, container }),
    createSessionSnapshotRoute(sessionManager),
    createImportSessionRoute({ sessionManager, container }),
    createSendMessageRoute({ sessionManager, container }),
  ];

  // Middleware pipeline
  const withMiddleware = compose(corsMiddleware, compressionMiddleware);

  // Request handler — this is what http.createServer receives
  return withMiddleware(async (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';

    if (url !== '/health' && url !== '/api/health') {
      console.log(`[HTTP] ${method} ${url}`);
    }

    try {
      for (const route of routes) {
        if (route.matches(method, url)) {
          return route.handler(req, res);
        }
      }

      // SPA fallback
      serveStatic(req, res);
    } catch (error) {
      console.error('[HTTP] Unhandled error:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
  });
}
