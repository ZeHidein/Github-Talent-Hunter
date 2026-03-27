import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SessionManager } from '../../ws/session-manager';
import type { Route } from './route';

const PATH = '/api/session-snapshot';

export function createSessionSnapshotRoute(sessionManager: SessionManager): Route {
  return {
    matches: (method, url) => method === 'GET' && (url === PATH || url.startsWith(PATH + '?')),

    handler: async (req: IncomingMessage, res: ServerResponse) => {
      const parsed = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const sessionId = parsed.searchParams.get('session_id');

      if (!sessionId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'session_id is required' }));
        return;
      }

      const session = sessionManager.get(sessionId);
      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
      }

      if (session.status === 'processing') {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session is processing', retryAfter: 2 }));
        return;
      }

      const conversationHistory = session.getConversationHistory();
      const storedContents = await session.getStoredContents(0);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          sessionKey: session.sessionKey,
          conversationHistory,
          storedContents,
          snapshotTimestamp: Date.now(),
        }),
      );
    },
  };
}
