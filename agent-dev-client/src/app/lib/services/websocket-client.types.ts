import type { AgentContent } from '@/lib/agent-library';
import type {
  MemoryEntry,
  StoredContent as StoredContentGeneric,
  ContentResumeResult as ContentResumeResultGeneric,
  AgentStreamContent as AgentStreamContentGeneric,
} from '../../../../../shared';

export type {
  SessionInfo,
  FinishSignalContent,
  ErrorSignalContent,
  MemoryEntry,
} from '../../../../../shared';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface WebSocketClientOptions {
  baseUrl?: string;
  getAgentSessionId?: () => string | null;
  createWebSocket?: (url: string) => WebSocket;
  onSessionJoined?: (sessionKey: string) => void;
}

export interface SendMessageOptions {
  files?: unknown[];
  instruction?: string;
  memoryBank?: MemoryEntry[];
  metadata?: Record<string, unknown>;
  /** When true, the user message is stored but not rendered in chat UI */
  hidden?: boolean;
}

export type StoredContent = StoredContentGeneric<AgentContent>;
export type ContentResumeResult = ContentResumeResultGeneric<AgentContent>;
export type AgentStreamContent = AgentStreamContentGeneric<AgentContent>;
