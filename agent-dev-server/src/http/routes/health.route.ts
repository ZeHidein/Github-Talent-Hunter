import type { ServerResponse } from 'node:http';
import type { Route } from './route';

export function createHealthRoute(): Route {
  return {
    matches: (method, url) => method === 'GET' && (url === '/health' || url === '/api/health'),
    handler: (_req, res: ServerResponse) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    },
  };
}
