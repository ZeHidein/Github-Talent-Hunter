import { initTRPC } from '@trpc/server';
import type { AgentStorageFactoryService } from '../services/agent-storage-factory.service';
import type { ActionLog } from '../bl/action-log/action-log';
import type { AgentSession } from '../ws/agent-session';

export interface TRPCContext {
  storage: ReturnType<AgentStorageFactoryService['getStorage']>;
  actionLog: ActionLog;
  sessionKey: string;
  invalidate: (topic: string) => void;
}

export type CreateTRPCContextParams = {
  sessionKey: string;
  actionLog: ActionLog;
  storageFactory: AgentStorageFactoryService;
  session: AgentSession;
};

export function createTRPCContext(params: CreateTRPCContextParams): TRPCContext {
  return {
    storage: params.storageFactory.getStorage(),
    actionLog: params.actionLog,
    sessionKey: params.sessionKey,
    invalidate: (topic: string) => {
      params.session.broadcast({ method: 'data.invalidate', params: { topic } });
    },
  };
}

const t = initTRPC.context<TRPCContext>().create();

export const createRouter = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;
export const createCallerFactory = t.createCallerFactory;
