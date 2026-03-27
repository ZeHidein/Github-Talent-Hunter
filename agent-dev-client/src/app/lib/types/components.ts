import type { PlainObject } from './common';
import type { SendMessagePropsT } from './messages';
import type { UIServicesContainerI } from './services';
import type { ReactElement } from 'react';

export type AgentConfigurationType = 'preview' | 'published';

export interface ConversationInputProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  isUserRequestPending: boolean;
  recordingPanelClassName?: string;
  recordingButtonClassName?: string;
  inputClassName?: string;
  onSend: (text: string) => any;
  onStopStreaming?: () => void;
}

export type AsArgumentsProps<T extends PlainObject = PlainObject> = {
  argumentsProps: T;
  services: UIServicesContainerI;
  handleSendMessage: (argobj: SendMessagePropsT) => void;
  renderConversationInput: (props?: Partial<ConversationInputProps>) => ReactElement;
};

export type McpConfigT = {
  type: 'mcp';
  name: string;
  serverUrl: string;
  headers?: Record<string, string>;
};

export type ComponentConfigT = {
  type: 'component';
  componentName: string; // unique name, by which the component will be identified on UI
  name: string; // name that will be used in LLM tool
  description: string; // description that will be used in LLM tool
  parameters: Record<string, unknown>; // schema that will be used in LLM tool
  isStrictSchema: boolean; // if true, the schema will be strict
  isStreaming: boolean; // if true, the component will be streamed
};
