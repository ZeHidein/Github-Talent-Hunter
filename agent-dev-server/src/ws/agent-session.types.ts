import type { WebSocket } from 'ws';
import type { RpcPeer } from '../../vendor/agentplace-transport/RpcPeer';

import type { AgentContent, Attachment } from '../bl/agent/agent-library';
import type { MemoryEntry } from '../types';
import type {
  SessionStatus as SessionStatusGeneric,
  StoredContent as StoredContentGeneric,
  SessionInfo as SessionInfoGeneric,
} from '../../../shared';

export type SessionStatus = SessionStatusGeneric;
export type StoredContent = StoredContentGeneric<AgentContent>;
export type SessionInfo = SessionInfoGeneric;

export interface AgentSessionOptions {
  sessionKey: string;
  userId: string;
  configId: string;
  ttlMs: number;
}

/**
 * A connected client tracked by the session.
 * connectionId is unique per WebSocket connection (not per session).
 */
export interface SessionClient {
  connectionId: string;
  rpcPeer: RpcPeer;
  ws: WebSocket; // kept for cleanup (close on session end)
}

export interface PendingMessage {
  id: string;
  params: MessageSendParams;
  rpcPeer: RpcPeer;
  connectionId: string;
  responseId: string;
}

export interface MessageSendParams {
  content: string;
  files?: Attachment[];
  conversationHistory?: unknown[];
  instruction?: string;
  memoryBank?: MemoryEntry[];
  metadata?: Record<string, unknown>;
  hidden?: boolean;
}

export interface MessageAbortParams {
  responseId: string;
}

/**
 * Component configuration sent from client for dynamic tool registration.
 */
export interface ComponentConfig {
  type: 'component';
  componentName: string;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  isStrictSchema: boolean;
  isStreaming: boolean;
}
