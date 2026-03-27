import { type FC, Fragment } from 'react';
import type { AgentConfigurationType, SendMessagePropsT } from '@/app/lib/types';

import { useMessagingStore, useServices, useChatRehydration } from '@/app/lib/hooks';
import { ConversationInput } from './ConversationInput';
import { VoiceReader } from './VoiceReader';
import { AudioSender } from './AudioSender';
import { ComponentRenderer } from './ComponentRenderer';
import { ChatView } from './ChatView';
import { useMessagingService } from '@/app/lib/hooks/useMessagingService';
import { observer } from 'mobx-react-lite';
import { getRegisteredComponents } from '@/app/lib/components/registry';
import { MCPToolStatus } from './MCPToolStatus';

type Props = {
  type: AgentConfigurationType;
};

export const Chat: FC<Props> = observer(() => {
  useMessagingService();
  const messagesStore = useMessagingStore();

  // Rehydrate conversation history from server on mount
  useChatRehydration();

  const { sendMessage, stopStreaming, visibleGroupedMessages, userRequestPending, speechEnabled } =
    messagesStore;

  const { fileUploadService, fileReadingService } = useServices();

  const injectedServices = {
    fileUploadService,
    fileReadingService,
  };

  const handleSendMessage = (payload: SendMessagePropsT) => {
    sendMessage({
      ...payload,
    });
  };

  return (
    <Fragment>
      <VoiceReader />
      <AudioSender
        onRecord={(bas64audio: string) =>
          sendMessage({
            audio: bas64audio,
          })
        }
      />
      <ChatView
        inputPosition="bottom"
        speechEnabled={speechEnabled}
        userRequestPending={userRequestPending}
        conversationInput={
          <div className="max-w-(--main-col-w) mx-auto px-6 xl:px-0 pt-0 pb-4">
            <ConversationInput
              isUserRequestPending={userRequestPending}
              onStopStreaming={stopStreaming}
              onSend={(text: string) =>
                handleSendMessage({
                  instruction: text,
                })
              }
            />
          </div>
        }
        renderDynamicComponent={(
          componentId: string,
          props: any,
          streamingState?: { isStreaming: boolean },
        ) => (
          <ComponentRenderer
            componentId={componentId}
            props={props}
            isStreaming={streamingState?.isStreaming}
            sendMessage={handleSendMessage}
            renderConversationInput={() => null}
            services={injectedServices}
            components={{
              ...getRegisteredComponents(),
              MCPToolStatus,
            }}
          />
        )}
        messages={visibleGroupedMessages}
        messagesStore={messagesStore}
      />
    </Fragment>
  );
});
