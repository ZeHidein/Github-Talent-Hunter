/**
 * OAuth Protected Resource Metadata (RFC 9470).
 *
 * Returns metadata pointing MCP clients to the platform's authorization server.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Route } from './route';

const PROTECTED_RESOURCE_PATHS = new Set([
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp',
  '/mcp/.well-known/oauth-protected-resource',
]);

function getAuthorizationServerUrl(): string {
  const url = process.env.MODEL_BASE_URL || 'http://localhost:8080';
  return url.replace('host.docker.internal', 'localhost');
}

export function createOAuthMetadataRoute(): Route {
  const authorizationServerUrl = getAuthorizationServerUrl();

  return {
    matches: (method, url) => method === 'GET' && PROTECTED_RESOURCE_PATHS.has(url),
    handler: (req: IncomingMessage, res: ServerResponse) => {
      const proto = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const resource = host
        ? `${proto}://${host}`
        : `http://localhost:${process.env.DEV_SERVER_PORT || 8090}`;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          resource,
          authorization_servers: [authorizationServerUrl],
          scopes_supported: ['agent:read', 'agent:create', 'agent:mcp'],
          bearer_methods_supported: ['header'],
        }),
      );
    },
  };
}
