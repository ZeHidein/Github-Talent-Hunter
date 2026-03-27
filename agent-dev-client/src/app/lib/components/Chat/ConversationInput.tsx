import { type ChangeEventHandler, type FC, Fragment, useCallback, useState } from 'react';

import type { ConversationInputProps } from '@/app/lib/types';
import { AgentInput } from '@/app/lib/components';
import { useMessagingStore } from '@/app/lib/hooks/useMessagingStore';
import { useAudioRecorderContext } from '@/app/lib/contexts';

export const ConversationInput: FC<ConversationInputProps> = ({
  isUserRequestPending,
  className,
  inputClassName,
  recordingButtonClassName,
  onSend,
  onStopStreaming,
  ...rest
}) => {
  const [request, setRequest] = useState('');
  const { toggleSpeech, speechEnabled } = useMessagingStore();
  const { enableMicrophone, disableMicrophone } = useAudioRecorderContext();

  const onSpeechToggle = useCallback(() => {
    if (!speechEnabled) {
      enableMicrophone();
    } else {
      disableMicrophone();
    }

    toggleSpeech();
  }, [speechEnabled, enableMicrophone, disableMicrophone, toggleSpeech]);

  const inputChanged: ChangeEventHandler<HTMLTextAreaElement> = useCallback(
    (e) => {
      setRequest(e.target.value);
    },
    [setRequest],
  );

  const handleSend = useCallback(() => {
    if (!request) {
      return;
    }
    onSend?.(request);
    setRequest('');
  }, [request, onSend]);

  const onKeyChange = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
      return;
    }
  };

  return (
    <div className="flex flex-row justify-center items-center relative">
      <AgentInput
        showSwitch={true}
        placeholder="Ask me anything..."
        className={className}
        inputClassName={inputClassName}
        recordingButtonClassName={recordingButtonClassName}
        onSpeechToggle={() => onSpeechToggle()}
        onStopStreaming={onStopStreaming}
        onChange={inputChanged}
        onKeyDown={onKeyChange}
        onSendClick={handleSend}
        speechEnabled={speechEnabled}
        isUserRequestPending={isUserRequestPending}
        {...rest}
        value={request}
      />
    </div>
  );
};
