import { createTRPCProxyClient, type TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { AppRouter } from '../../../../agent-dev-server/src/trpc/router';
import type { RpcPeer } from '../../../vendor/agentplace-transport/RpcPeer';

// Late-bound RpcPeer reference — set by WebSocketClient on connect/disconnect
let currentPeer: RpcPeer | null = null;
let peerWaiters: Array<(peer: RpcPeer) => void> = [];

export function setRpcPeer(peer: RpcPeer | null): void {
  currentPeer = peer;
  if (peer && peerWaiters.length > 0) {
    const waiters = peerWaiters;
    peerWaiters = [];
    for (const resolve of waiters) {
      resolve(peer);
    }
  }
}

function waitForPeer(): Promise<RpcPeer> {
  if (currentPeer) return Promise.resolve(currentPeer);
  return new Promise<RpcPeer>((resolve) => {
    peerWaiters.push(resolve);
  });
}

/**
 * Custom tRPC link that sends procedure calls over WebSocket via RpcPeer.ask().
 * Replaces httpBatchLink — all tRPC traffic flows through the single WebSocket connection.
 */
const rpcPeerLink: TRPCLink<AppRouter> = () => {
  return ({ op }) => {
    return observable((observer) => {
      const run = async () => {
        const peer = await waitForPeer();
        const result = await peer.ask<unknown>({
          method: 'trpc',
          path: op.path,
          type: op.type,
          input: op.input,
        });
        observer.next({ result: { type: 'data', data: result } });
        observer.complete();
      };
      run().catch((err) => {
        observer.error(err);
      });
    });
  };
};

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [rpcPeerLink],
});

export type { AppRouter };
