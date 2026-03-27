import { reaction } from 'mobx';

import { FileReadingService, FileUploadService, LoggerService } from './lib/services';

import { MessagesStore } from './lib/messaging/MessagesStore';
import { NotificationStore } from './lib/messaging/NotificationsStore';
import { StatusStore } from './lib/messaging/StatusStore';
import { SettingsStore } from './lib/messaging/SettingsStore';
import { MemoryStore } from './lib/messaging/MemoryStore';
import { wsManager } from './lib/services/websocket-manager';

export interface Container {
  loggerService: LoggerService;
  messagesStore: MessagesStore;
  statusStore: StatusStore;
  memoryStore: MemoryStore;
  fileReadingService: FileReadingService;
  fileUploadService: FileUploadService;
  settingsStore: SettingsStore;
}

export const buildContainer = async (): Promise<Container> => {
  const loggerService = new LoggerService({
    applicationName: 'agent-dev-client',
  });

  const memoryStore = new MemoryStore();

  // StatusStore: independent state machine driven by the content stream.
  const statusStore = new StatusStore();
  statusStore.subscribe(wsManager.onContent.bind(wsManager));

  const messagesStore = new MessagesStore({
    notificationsStore: new NotificationStore(),
    memoryStore,
  });

  // Cross-store wiring: instant "Thinking..." on send.
  // Neither store imports the other — the container coordinates.
  reaction(
    () => messagesStore.userRequestPending,
    (pending) => {
      if (pending) statusStore.onRequestStarted();
    },
  );

  const settingsStore = new SettingsStore(memoryStore);

  // Connect WebSocket before settings load — tRPC calls run over WebSocket (RpcPeer),
  // so the peer must be available before any tRPC queries fire.
  // wsManager.connect() is idempotent, so the later call in useChatRehydration is a no-op.
  await wsManager.connect();

  // Load settings before returning container - ensures memoryStore is initialized
  await settingsStore.load();

  const fileReadingService = new FileReadingService();
  const fileUploadService = new FileUploadService();

  return {
    loggerService,
    messagesStore,
    statusStore,
    memoryStore,
    fileReadingService,
    fileUploadService,
    settingsStore,
  };
};
