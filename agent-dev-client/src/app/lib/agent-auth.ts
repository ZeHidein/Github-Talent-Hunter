import { getApiBaseUrl } from './services/api-url';
import { type AuthStrategy, CookieAuth } from './services/auth-strategy';
import { SessionState } from './services/session-state';

export interface AgentAuthInitOptions {
  agentSessionId?: string;
}

class AgentAuthImpl {
  private auth: AuthStrategy | null = null;
  private session: SessionState | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async init(options?: AgentAuthInitOptions): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }
    if (this.initialized) {
      return;
    }

    this.initPromise = this._doInit(options);
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async _doInit(options?: AgentAuthInitOptions): Promise<void> {
    this.auth = new CookieAuth();

    const earlySessionId = SessionState.resolveInitialSessionId({
      explicit: options?.agentSessionId,
    });

    await this.auth.init();

    this.session = new SessionState({
      initialSessionId: earlySessionId,
    });

    this.initialized = true;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('AgentAuth not initialized. Call AgentAuth.init() first.');
    }
  }

  // ── Authenticated HTTP ──────────────────────────────────────────────

  async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    this.ensureInitialized();

    const headers = new Headers(options.headers);
    for (const [k, v] of Object.entries(this.auth!.getHeaders())) {
      headers.set(k, v);
    }

    const currentSessionId = this.session?.agentSessionId;
    if (currentSessionId) {
      headers.set('x-agentplace-session-id', currentSessionId);
    }

    const response = await fetch(url, { ...options, headers });

    this.session!.maybeUpdateFromResponse(response);

    return response;
  }

  async get<T>(url: string): Promise<T> {
    const res = await this.fetch(url);
    if (!res.ok) {
      throw new Error(`GET ${url} failed: ${res.status}`);
    }
    return res.json();
  }

  async post<T>(url: string, body: unknown): Promise<T> {
    const res = await this.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`POST ${url} failed: ${res.status}`);
    }
    return res.json();
  }

  async put<T>(url: string, body: unknown): Promise<T> {
    const res = await this.fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PUT ${url} failed: ${res.status}`);
    return res.json();
  }

  async patch<T>(url: string, body?: unknown): Promise<T> {
    const res = await this.fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`PATCH ${url} failed: ${res.status}`);
    return res.json();
  }

  async delete<T>(url: string): Promise<T> {
    const res = await this.fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error(`DELETE ${url} failed: ${res.status}`);
    return res.json();
  }

  async postForm<T>(url: string, formData: FormData): Promise<T> {
    const res = await this.fetch(url, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      throw new Error(`POST ${url} failed: ${res.status}`);
    }
    return res.json();
  }

  async postStream(
    url: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>> {
    const res = await this.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      throw new Error(`POST ${url} failed: ${res.status}`);
    }
    return res.body!;
  }

  // ── Auth & Session ──────────────────────────────────────────────────

  getBaseUrl(): string {
    return getApiBaseUrl();
  }

  createWebSocket(url: string, protocols?: string | string[]): WebSocket {
    this.ensureInitialized();
    return this.auth!.createWebSocket(url, protocols);
  }

  setSessionId(sessionId: string): void {
    this.session?.setSessionId(sessionId);
  }

  get agentSessionId(): string | null {
    return this.session?.agentSessionId ?? null;
  }
}

export const AgentAuth = new AgentAuthImpl();
