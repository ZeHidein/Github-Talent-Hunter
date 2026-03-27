import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';

const SESSION_ID_HEADER = 'x-agentplace-session-id';

export function generateSessionId(): string {
  return crypto.randomUUID();
}

export function getSessionIdFromRequest(req: IncomingMessage): string {
  const headerValue = req.headers[SESSION_ID_HEADER];
  if (headerValue && typeof headerValue === 'string') {
    return headerValue;
  }
  return generateSessionId();
}

export interface SessionIdentity {
  sessionId: string;
  userId: string;
  configId: string;
}

export function extractSessionIdentity(
  req: IncomingMessage,
  defaultConfigId = process.env.AGENT_ID || 'unknown',
): SessionIdentity {
  return {
    sessionId: getSessionIdFromRequest(req),
    userId: (req.headers['x-user-id'] as string) || process.env.ADMIN_USER_ID || 'anonymous',
    configId: defaultConfigId,
  };
}
