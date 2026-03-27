import type { AgentContent } from '../bl/agent/agent-library';
import type {
  SessionJoinedParams as SessionJoinedParamsGeneric,
  ContentResumeParams as ContentResumeParamsGeneric,
  ContentResumeResult as ContentResumeResultGeneric,
} from '../../../shared';

// WebSocket close codes
export const CloseCodes = {
  NORMAL: 1000,
  AUTH_FAILED: 4001,
  CONFIG_MISMATCH: 4003,
  SERVER_ERROR: 4500,
} as const;

export type SessionJoinedParams = SessionJoinedParamsGeneric;
export type ContentResumeParams = ContentResumeParamsGeneric;
export type ContentResumeResult = ContentResumeResultGeneric<AgentContent>;
