import type { FC, PropsWithChildren } from 'react';

import { ServicesContext } from '../contexts';
import { AudioRecorderProvider } from '../contexts/recorder';
import type { Container } from '../../container';
import { MessagesStoreProvider } from '../hooks/useMessagingStore';
import { StatusStoreProvider } from '../hooks/useStatusStore';

type Props = {
  container: Container;
};

export const AppRoot: FC<PropsWithChildren<Props>> = ({ children, container }) => {
  return (
    <ServicesContext.Provider value={container}>
      <AudioRecorderProvider>
        <StatusStoreProvider value={container.statusStore}>
          <MessagesStoreProvider store={container.messagesStore}>{children}</MessagesStoreProvider>
        </StatusStoreProvider>
      </AudioRecorderProvider>
    </ServicesContext.Provider>
  );
};
