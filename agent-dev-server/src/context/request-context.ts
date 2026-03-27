/**
 * RequestContext for agent-dev-server
 *
 * Simplified context that stores session-level information
 * accessible to tools during agent execution.
 */
export class RequestContext {
  private sessionKey: string;
  private userId: string;
  private configId: string;

  constructor(params: { sessionKey: string; userId?: string; configId?: string }) {
    this.sessionKey = params.sessionKey;
    this.userId = params.userId ?? 'anonymous';
    this.configId = params.configId ?? 'unknown';
  }

  getSessionKey(): string {
    return this.sessionKey;
  }

  getUserId(): string {
    return this.userId;
  }

  getConfigId(): string {
    return this.configId;
  }
}
