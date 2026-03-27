/**
 * Shared WebSocket protocol types between agent-dev-server and agent-dev-client.
 *
 * These define the wire protocol — the shape of messages exchanged over the
 * WebSocket connection. Types that reference domain-specific content use a
 * generic `TContent = unknown` so this file has zero imports.
 */

export type SessionStatus = 'idle' | 'processing';

/**
 * Stored content item with sequence number and timestamp.
 * Contains content directly and only stores final states (not streaming deltas).
 */
export interface StoredContent<TContent = unknown> {
  seq: number;
  timestamp: number;
  content: TContent;
}

export interface SessionInfo {
  sessionKey: string;
  userId: string;
  configId: string;
  status: SessionStatus;
  clientCount: number;
  contentSeq: number;
  oldestContentSeq: number;
  createdAt: string;
  remainingTtlMs: number;
  conversationHistory: unknown[];
}

export interface SessionJoinedParams {
  sessionKey: string;
  status: string;
  contentSeq: number;
}

export interface ContentResumeParams {
  afterSeq: number;
}

export interface ContentResumeResult<TContent = unknown> {
  contents: StoredContent<TContent>[];
  replayed: number;
  currentSeq: number;
  warning?: string;
  oldestAvailable?: number;
}

export type FinishSignalContent = {
  type: 'finish';
  messageId: 'finish';
  responseId?: string;
};

export type ErrorSignalContent = {
  type: 'error';
  messageId: 'error';
  responseId?: string;
  error: string;
};

export type AgentStreamContent<TContent = unknown> =
  | TContent
  | FinishSignalContent
  | ErrorSignalContent;

export type MemoryEntry = {
  id: string;
  summary: string;
  timestamp: number;
};
