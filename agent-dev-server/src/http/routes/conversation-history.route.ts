import type { ServerResponse } from 'node:http';
import type { SessionManager } from '../../ws/session-manager';
import type { Route } from './route';

export function createConversationHistoryRoute(sessionManager: SessionManager): Route {
  return {
    matches: (method, url) =>
      method === 'GET' && (url === '/api/conversation-history' || url === '/conversation-history'),
    handler: (_req, res: ServerResponse) => {
      const current = sessionManager.getCurrentConversationHistory();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          sessionKey: current?.sessionKey ?? null,
          conversationHistory: current?.conversationHistory ?? [],
        }),
      );
    },
  };
}
