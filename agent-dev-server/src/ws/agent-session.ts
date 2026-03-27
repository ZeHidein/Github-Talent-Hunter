import type { RpcPeer } from '../../vendor/agentplace-transport/RpcPeer';
import type {
  AgentSessionOptions,
  SessionStatus,
  SessionClient,
  StoredContent,
  SessionInfo,
  PendingMessage,
  MessageSendParams,
  ComponentConfig,
} from './agent-session.types';
import { type AgentContent, isStreamingDelta, MemoryReplayBuffer } from '../bl/agent/agent-library';
import type { FinishSignalContent, ErrorSignalContent } from '../../../shared';
import { ActionLog } from '../bl/action-log/action-log';

/**
 * Represents a single agent session with state, content buffer, and connected clients.
 */
export class AgentSession {
  readonly sessionKey: string;
  readonly userId: string;
  readonly configId: string;
  readonly createdAt: Date;
  readonly actionLog: ActionLog;

  #ttlMs: number;
  #lastActivityAt: Date;
  #status: SessionStatus = 'idle';
  #clients = new Map<string, SessionClient>();

  // Content buffer — delegated to MemoryReplayBuffer
  #replayBuffer: MemoryReplayBuffer;
  #lastSeq = 0;

  // Message queue (max 1)
  #pendingMessage: PendingMessage | null = null;

  // Conversation state persisted across messages
  #conversationHistory: unknown[] = [];

  // Component configs registered by the client
  #componentConfigs: ComponentConfig[] = [];

  constructor(options: AgentSessionOptions) {
    this.sessionKey = options.sessionKey;
    this.userId = options.userId;
    this.configId = options.configId;
    this.createdAt = new Date();
    this.#lastActivityAt = new Date();
    this.#ttlMs = options.ttlMs;

    this.actionLog = new ActionLog();
    this.#replayBuffer = new MemoryReplayBuffer({ maxEvents: 500 });
    void this.#replayBuffer.startStream(this.sessionKey);

    console.log(`[AgentSession] Created session ${this.sessionKey} for user ${this.userId}`);
  }

  // --- Status ---

  get status(): SessionStatus {
    return this.#status;
  }

  setStatus(status: SessionStatus): void {
    this.#status = status;
    this.touch();
  }

  // --- Client Management ---

  get clientCount(): number {
    return this.#clients.size;
  }

  get hasClients(): boolean {
    return this.#clients.size > 0;
  }

  addClient(connectionId: string, client: SessionClient): void {
    this.#clients.set(connectionId, client);
    this.touch();
    console.log(
      `[AgentSession] Client connected to ${this.sessionKey}, count: ${this.#clients.size}`,
    );
  }

  removeClient(connectionId: string): void {
    this.#clients.delete(connectionId);
    console.log(
      `[AgentSession] Client disconnected from ${this.sessionKey}, count: ${this.#clients.size}`,
    );
  }

  /**
   * Broadcast a message to all connected clients
   */
  broadcast(message: { method: string; params: unknown }): void {
    for (const client of this.#clients.values()) {
      client.rpcPeer.notify(message, { requireAck: false }).catch(() => {});
    }
  }

  // --- Content Broadcasting & Storage ---

  /**
   * Broadcast content to all connected clients.
   * The content may include a responseId for grouping.
   */
  broadcastContent(
    content: (AgentContent | FinishSignalContent | ErrorSignalContent) & { responseId?: string },
  ): void {
    this.broadcast({
      method: 'content',
      params: content,
    });
  }

  /**
   * Store content (only final states, skip streaming deltas).
   * Text merging and ring buffer are handled by MemoryReplayBuffer.
   */
  pushContent(content: AgentContent): void {
    if (isStreamingDelta(content)) return;

    // captureEvent is async but purely in-memory (no I/O).
    // Fire-and-forget; track seq via .then() for the contentSeq getter.
    void this.#replayBuffer.captureEvent(this.sessionKey, content).then((seq) => {
      if (seq > 0) this.#lastSeq = seq;
    });
  }

  /**
   * Get stored content after a given sequence number.
   */
  async getStoredContents(afterSeq: number = 0): Promise<StoredContent[]> {
    const { events } = await this.#replayBuffer.getEvents(this.sessionKey, afterSeq);
    return events.map((e) => ({
      seq: (e as { eventSeq?: number }).eventSeq ?? 0,
      timestamp: Date.now(),
      content: e as AgentContent,
    }));
  }

  /**
   * Get the current content sequence number.
   */
  get contentSeq(): number {
    return this.#lastSeq;
  }

  /**
   * Get the oldest content sequence number available.
   */
  async getOldestContentSeq(): Promise<number> {
    const { events } = await this.#replayBuffer.getEvents(this.sessionKey);
    if (events.length === 0) return 0;
    return (events[0] as { eventSeq?: number }).eventSeq ?? 0;
  }

  // --- Message Queue ---

  get hasPendingMessage(): boolean {
    return this.#pendingMessage !== null;
  }

  /**
   * Queue a message. Returns false if queue is full (max 1).
   */
  queueMessage(
    id: string,
    params: MessageSendParams,
    rpcPeer: RpcPeer,
    connectionId: string,
    responseId: string,
  ): boolean {
    if (this.#pendingMessage !== null) {
      return false; // Queue full
    }
    this.#pendingMessage = { id, params, rpcPeer, connectionId, responseId };
    return true;
  }

  /**
   * Dequeue and return the pending message
   */
  dequeueMessage(): PendingMessage | null {
    const msg = this.#pendingMessage;
    this.#pendingMessage = null;
    return msg;
  }

  // --- Conversation State ---

  getConversationHistory(): unknown[] {
    return this.#conversationHistory;
  }

  setConversationHistory(history: unknown[]): void {
    this.#conversationHistory = history;
  }

  // --- Component Configs ---

  getComponentConfigs(): ComponentConfig[] {
    return this.#componentConfigs;
  }

  setComponentConfigs(configs: ComponentConfig[]): void {
    this.#componentConfigs = configs;
  }

  // --- TTL & Activity ---

  touch(): void {
    this.#lastActivityAt = new Date();
  }

  isExpired(): boolean {
    const now = Date.now();
    const expireAt = this.#lastActivityAt.getTime() + this.#ttlMs;
    return now > expireAt;
  }

  get remainingTtlMs(): number {
    const now = Date.now();
    const expireAt = this.#lastActivityAt.getTime() + this.#ttlMs;
    return Math.max(0, expireAt - now);
  }

  // --- State Import ---

  /**
   * Atomically replace this session's replay buffer and conversation history.
   * Used by the import-session endpoint to restore state from a snapshot.
   * Returns the final content sequence number.
   */
  async importState(
    conversationHistory: unknown[],
    storedContents: { content: unknown }[],
  ): Promise<number> {
    // Reset replay buffer
    await this.#replayBuffer.shutdown();
    this.#replayBuffer = new MemoryReplayBuffer({ maxEvents: 500 });
    await this.#replayBuffer.startStream(this.sessionKey);
    this.#lastSeq = 0;

    // Set conversation history
    this.#conversationHistory = conversationHistory;

    // Re-push stored contents
    for (const item of storedContents) {
      const seq = await this.#replayBuffer.captureEvent(this.sessionKey, item.content);
      if (seq > 0) this.#lastSeq = seq;
    }

    this.touch();
    return this.#lastSeq;
  }

  // --- Cleanup ---

  cleanup(): void {
    this.actionLog.flush();

    for (const client of this.#clients.values()) {
      try {
        client.ws.close(1000, 'Session ended');
      } catch {}
    }
    this.#clients.clear();

    // MemoryReplayBuffer.shutdown() clears all streams and stops cleanup timer
    void this.#replayBuffer.shutdown();

    this.#pendingMessage = null;

    console.log(`[AgentSession] Cleaned up session ${this.sessionKey}`);
  }

  // --- Info ---

  async getInfo(): Promise<SessionInfo> {
    return {
      sessionKey: this.sessionKey,
      userId: this.userId,
      configId: this.configId,
      status: this.#status,
      clientCount: this.#clients.size,
      contentSeq: this.#lastSeq,
      oldestContentSeq: await this.getOldestContentSeq(),
      createdAt: this.createdAt.toISOString(),
      remainingTtlMs: this.remainingTtlMs,
      conversationHistory: this.#conversationHistory,
    };
  }
}
