import type { ComponentConfig } from './ws/agent-session.types';

export type AgentMessageTypeT = 'TXT' | 'Component' | 'Tool';
export interface IncomingMessageBasicI {
  messageId: string;
  contentId?: string;
  responseId?: string;
  previousVersion?: string;
}

export interface AgentMessagePayloadBasicI extends IncomingMessageBasicI {
  type: AgentMessageTypeT;
  content: any;
  index?: number | null;
}

export interface AgentTextMessagePayloadI extends AgentMessagePayloadBasicI {
  type: 'TXT';
  content: string;
}

export interface AgentToolPayloadI extends AgentMessagePayloadBasicI {
  type: 'Tool';
  tool: any;
  content: any;
}

export interface AgentComponentMessagePayloadI extends AgentMessagePayloadBasicI {
  type: 'Component';
  content: {
    componentName: string;
    componentCode: string;
    componentId: string;
    props: Record<string, any>;
  };
  tool?: any;
}

export type AgentMessagePayloadT =
  | AgentTextMessagePayloadI
  | AgentComponentMessagePayloadI
  | AgentToolPayloadI;

export type AgentMessageT = {
  componentName: string;
  type: AgentMessagePayloadT['type'];
  content: AgentMessagePayloadT['content'];
  id: string;
  role: MessageRoles.agent;
};

export enum MessageRoles {
  user = 'user',
  agent = 'assistant',
}

export interface UserTextMessagePayloadI {
  type: 'TXT';
  content: string;
}

export interface UserAudioMessagePayloadI {
  type: 'audio';
  content: {
    data: string;
    text?: string;
  };
}

export type UserMessagePayloadT = UserTextMessagePayloadI | UserAudioMessagePayloadI;

export type UserMessageT = {
  type: UserMessagePayloadT['type'];
  content: UserMessagePayloadT['content'];
  id: string;
  role: MessageRoles.user;
  files?: Attachment[];
};

import type { MemoryEntry } from '../../shared';
import type { Attachment } from './bl/agent/agent-library';
export type { MemoryEntry } from '../../shared';

export type SendMessageParamsT = {
  configId: string;
  message:
    | { type: 'TXT'; content: string }
    | { type: 'audio'; content: { data: string; text?: string } };
  instruction: string;
  metadata?: Record<string, unknown>;
  /** Supports both OpenAI Agents SDK (AgentInputItem) and AI SDK (ModelMessage) formats */
  conversationHistory: unknown[];
  files?: Attachment[];
  renderedMessages?: PreviewMessageT[];
  memories?: MemoryEntry[];
  /** Session key for context storage - allows tools to access session info */
  sessionKey?: string;
  /** Component configs registered by the client for dynamic tool creation */
  componentConfigs?: ComponentConfig[];
};

export type UIMessageT = AgentMessageT | UserMessageT;

export type PreviewMessageT = UIMessageT;
