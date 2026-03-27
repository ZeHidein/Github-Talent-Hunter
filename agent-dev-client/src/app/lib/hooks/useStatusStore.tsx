import { createContext, useContext } from 'react';
import type { StatusStore } from '../messaging/StatusStore';

const StatusStoreContext = createContext<StatusStore | undefined>(undefined);

export const useStatusStore = () => {
  const ctx = useContext(StatusStoreContext);
  if (!ctx) {
    throw new Error('useStatusStore must be used within a StatusStoreProvider');
  }
  return ctx;
};

export const StatusStoreProvider = StatusStoreContext.Provider;
