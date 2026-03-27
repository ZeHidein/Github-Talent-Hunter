import type React from 'react';
import { createContext, useContext } from 'react';
import type { MessagesStore } from '../messaging/MessagesStore';

export const MessagesStoreContext = createContext<MessagesStore | undefined>(undefined);

export const useMessagingStore = () => {
  const context = useContext(MessagesStoreContext);
  if (context === undefined) {
    throw new Error('useMessagingStore must be used within a MessagesStoreProvider');
  }
  return context;
};

interface MessagesStoreProviderProps {
  children: React.ReactNode;
  store: MessagesStore;
}

export const MessagesStoreProvider: React.FC<MessagesStoreProviderProps> = ({
  children,
  store,
}) => {
  return <MessagesStoreContext.Provider value={store}>{children}</MessagesStoreContext.Provider>;
};
