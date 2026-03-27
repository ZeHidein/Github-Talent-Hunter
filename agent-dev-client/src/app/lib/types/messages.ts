import type { Attachment } from './files';

export interface UserMessagePayloadBaseI {
  id: string;
}

export interface UserTextMessagePayloadI extends UserMessagePayloadBaseI {
  type: 'TXT';
  content: string;
}

export interface UserAudioMessagePayloadI extends UserMessagePayloadBaseI {
  type: 'audio';
  content: {
    data: string;
    text?: string;
  };
}

export type UserMessagePayloadT = UserTextMessagePayloadI | UserAudioMessagePayloadI;

export type SendMessagePropsBase = {
  files?: Attachment[];
  metadata?: Record<string, any>;
  conversationHistory?: any[];
};

export type SendMessagePropsT = SendMessagePropsBase &
  ({ instruction: string; audio?: never } | { audio: string; instruction?: never });
