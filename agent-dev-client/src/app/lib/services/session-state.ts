const SESSION_ID_STORAGE_KEY = 'agentplace_session_id';

export interface SessionStateOptions {
  initialSessionId?: string | null;
}

export class SessionState {
  #agentSessionId: string | null;

  constructor(options: SessionStateOptions) {
    this.#agentSessionId = options.initialSessionId ?? null;
  }

  static resolveInitialSessionId(opts: { explicit?: string | null }): string | null {
    if (opts.explicit) {
      return opts.explicit;
    }

    if (typeof window !== 'undefined') {
      const urlSessionId = new URLSearchParams(window.location.search).get('agent_session_id');
      if (urlSessionId) {
        return urlSessionId;
      }
    }

    try {
      return localStorage.getItem(SESSION_ID_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  get agentSessionId(): string | null {
    return this.#agentSessionId;
  }

  setSessionId(sessionId: string): void {
    this.#agentSessionId = sessionId;
    this.#persistSessionId(sessionId);
  }

  maybeUpdateFromResponse(response: Response): boolean {
    const sessionId = response.headers.get('X-Agentplace-Session-Id');
    if (sessionId && sessionId !== this.#agentSessionId) {
      console.warn(
        `[SessionState] Server returned different session ID: ${sessionId} (was: ${this.#agentSessionId}). ` +
          `This may indicate a session ID injection issue.`,
      );
      this.setSessionId(sessionId);
      return true;
    }
    return false;
  }

  #persistSessionId(sessionId: string): void {
    try {
      localStorage.setItem(SESSION_ID_STORAGE_KEY, sessionId);
    } catch {
      // ignore
    }
  }
}
