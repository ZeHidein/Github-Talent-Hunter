import { useEffect } from 'react';
import { messageDispatcher } from '../services/messageDispatcher';
import { useMessagingStore } from './useMessagingStore';

const MESSAGE_TYPE_REQUEST = 'agent-get-messages-request';
const MESSAGE_TYPE_RESPONSE = 'agent-messages-response';
const MESSAGE_TYPE_ERROR = 'agent-messages-error';

/**
 * Hook to listen for requests for messaging state from the parent window
 * and respond with the current messages.
 */
export const useMessagingService = () => {
  const messagesStore = useMessagingStore();

  useEffect(() => {
    const handleRequest = (ev: MessageEvent) => {
      if (ev.data?.type !== MESSAGE_TYPE_REQUEST) {
        return;
      }

      try {
        const stateSnapshot = {
          messages: messagesStore.contents,
          userRequestPending: messagesStore.userRequestPending,
        };

        (ev.source as WindowProxy)?.postMessage(
          {
            type: MESSAGE_TYPE_RESPONSE,
            payload: stateSnapshot,
          },
          ev.origin || '*',
        );
      } catch (err) {
        console.error(`Error handling ${MESSAGE_TYPE_REQUEST}:`, err);
        (ev.source as WindowProxy)?.postMessage(
          {
            type: MESSAGE_TYPE_ERROR,
            message: err instanceof Error ? err.message : 'Unknown error',
          },
          ev.origin || '*',
        );
      }
    };

    const unsubscribe = messageDispatcher.subscribe(MESSAGE_TYPE_REQUEST, handleRequest);
    return () => {
      unsubscribe();
    };
  }, [messagesStore.contents, messagesStore.groupedMessages, messagesStore.userRequestPending]);
};
