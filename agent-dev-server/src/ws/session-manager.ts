import { AgentSession } from './agent-session';
import { log } from '../util/logger';

export interface SessionManagerOptions {
  ttlMs?: number;
  /**
   * Callback invoked when a new session is created.
   * Use this to initialize external services (e.g., storage) for the session.
   */
  onSessionCreated?: (session: AgentSession) => Promise<void>;
}

export interface SessionIdentity {
  userId: string;
  configId: string;
}

export interface SessionManagerStats {
  totalSessions: number;
  totalClients: number;
  idleSessions: number;
  processingSessions: number;
}

/**
 * Manages agent sessions with TTL-based expiry
 */
export class SessionManager {
  #sessions = new Map<string, AgentSession>();
  #ttlMs: number;
  #cleanupInterval: NodeJS.Timeout | null = null;
  #onSessionCreated: ((session: AgentSession) => Promise<void>) | null = null;

  constructor(options: SessionManagerOptions = {}) {
    this.#ttlMs = options.ttlMs ?? 60 * 60 * 1000; // 1 hour default
    this.#onSessionCreated = options.onSessionCreated ?? null;
  }

  /**
   * Get an existing session or create a new one.
   * Now async to support initialization callback.
   */
  async getOrCreate(sessionKey: string, identity: SessionIdentity): Promise<AgentSession> {
    let session = this.#sessions.get(sessionKey);

    if (session && !session.isExpired()) {
      session.touch();
      return session;
    }

    // Create new session (or replace expired one)
    if (session) {
      log('info', { event: 'session.expired', sessionKey });
      session.cleanup();
    }

    session = new AgentSession({
      sessionKey,
      userId: identity.userId,
      configId: identity.configId,
      ttlMs: this.#ttlMs,
    });
    this.#sessions.set(sessionKey, session);

    log('info', {
      event: 'session.created',
      sessionKey,
      userId: identity.userId,
      configId: identity.configId,
      totalSessions: this.#sessions.size,
    });

    // Call async initialization hook if provided
    if (this.#onSessionCreated) {
      try {
        await this.#onSessionCreated(session);
      } catch (error) {
        log('error', {
          event: 'session.created.hook.error',
          sessionKey,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return session;
  }

  /**
   * Get an existing session (returns undefined if not found or expired)
   */
  get(sessionKey: string): AgentSession | undefined {
    const session = this.#sessions.get(sessionKey);
    if (session && session.isExpired()) {
      log('info', { event: 'session.expired', sessionKey, trigger: 'access' });
      session.cleanup();
      this.#sessions.delete(sessionKey);
      return undefined;
    }
    return session;
  }

  /**
   * Delete a session
   */
  delete(sessionKey: string): boolean {
    const session = this.#sessions.get(sessionKey);
    if (session) {
      session.cleanup();
      this.#sessions.delete(sessionKey);
      log('info', { event: 'session.deleted', sessionKey, totalSessions: this.#sessions.size });
      return true;
    }
    return false;
  }

  /**
   * Get the number of sessions
   */
  get size(): number {
    return this.#sessions.size;
  }

  /**
   * Start periodic cleanup of expired sessions
   */
  startCleanup(intervalMs: number = 60000): void {
    if (this.#cleanupInterval) {
      return;
    }

    this.#cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, intervalMs);

    log('info', { event: 'cleanup.started', intervalMs });
  }

  /**
   * Stop periodic cleanup
   */
  stopCleanup(): void {
    if (this.#cleanupInterval) {
      clearInterval(this.#cleanupInterval);
      this.#cleanupInterval = null;
      log('info', { event: 'cleanup.stopped' });
    }
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpired(): number {
    let cleaned = 0;
    for (const [key, session] of this.#sessions) {
      if (session.isExpired()) {
        const ageMs = Date.now() - session.createdAt.getTime();
        log('info', {
          event: 'session.expired',
          sessionKey: key,
          trigger: 'cleanup',
          ageMs,
          contentBuffered: session.contentSeq,
        });
        session.cleanup();
        this.#sessions.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log('info', {
        event: 'cleanup.complete',
        cleanedCount: cleaned,
        remaining: this.#sessions.size,
      });
    }

    return cleaned;
  }

  /**
   * Graceful shutdown - clean up all sessions
   */
  shutdown(): void {
    log('info', { event: 'session.manager.shutdown', totalSessions: this.#sessions.size });
    this.stopCleanup();
    for (const [key, session] of this.#sessions) {
      session.cleanup();
    }
    this.#sessions.clear();
    log('info', { event: 'session.manager.shutdown.complete' });
  }

  /**
   * Get conversation history from the most recently active (current) session.
   * Returns the history from the session with the highest remaining TTL.
   */
  getCurrentConversationHistory(): {
    sessionKey: string;
    conversationHistory: unknown[];
  } | null {
    let bestSession: { key: string; session: AgentSession } | null = null;
    let bestRemainingTtl = -1;

    for (const [key, session] of this.#sessions) {
      if (!session.isExpired() && session.remainingTtlMs > bestRemainingTtl) {
        bestRemainingTtl = session.remainingTtlMs;
        bestSession = { key, session };
      }
    }

    if (!bestSession) {
      return null;
    }

    return {
      sessionKey: bestSession.key,
      conversationHistory: bestSession.session.getConversationHistory(),
    };
  }

  /**
   * Get session statistics
   */
  getStats(): SessionManagerStats {
    let totalClients = 0;
    let idleSessions = 0;
    let processingSessions = 0;

    for (const session of this.#sessions.values()) {
      totalClients += session.clientCount;
      if (session.status === 'idle') {
        idleSessions++;
      }
      if (session.status === 'processing') {
        processingSessions++;
      }
    }

    return {
      totalSessions: this.#sessions.size,
      totalClients,
      idleSessions,
      processingSessions,
    };
  }
}
