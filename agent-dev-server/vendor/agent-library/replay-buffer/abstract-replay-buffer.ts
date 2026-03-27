import { getAgentLogger } from '../types/logger.ts';
import type { CatchUpResult } from '../streaming/protocol.ts';
import type {
  IReplayBuffer,
  StartStreamOptions,
  StreamMetadata,
  StreamEventMessage,
  StreamTransport,
  CatchUpOptions,
} from './types.ts';

const EVENT_DELAY_MS = 4;

/**
 * Base class for replay buffer implementations.
 * Provides the catchUp() orchestration — subclasses only implement storage.
 */
export abstract class AbstractReplayBuffer implements IReplayBuffer {
  abstract startStream(streamId: string, options?: StartStreamOptions): Promise<void>;
  abstract captureEvent(streamId: string, content: unknown): Promise<number>;
  abstract endStream(streamId: string, error?: string): Promise<void>;
  abstract finalizeStream(streamId: string): void;
  abstract getMetadata(streamId: string): Promise<StreamMetadata | null>;
  abstract getEvents(
    streamId: string,
    afterEventSeq?: number,
  ): Promise<{ events: unknown[]; lastEventSeq: number }>;
  abstract subscribe(
    streamId: string,
    onMessage: (message: StreamEventMessage) => void,
  ): Promise<() => void>;
  abstract isStreamAlive(streamId: string): Promise<boolean>;
  abstract shutdown(): Promise<void>;

  async catchUp(options: CatchUpOptions): Promise<CatchUpResult> {
    const { streamId, transport, afterEventSeq = 0, isLocallyActive } = options;

    let unsubscribe: (() => void) | null = null;

    try {
      const metadata = await this.getMetadata(streamId);
      if (!metadata) {
        return { type: 'error', error: 'Stream not found or expired', requestId: streamId };
      }

      // Buffer for live events that arrive between subscribe and XRANGE
      const buffer: StreamEventMessage[] = [];
      let forwardHandler: ((msg: StreamEventMessage) => void) | null = null;

      if (metadata.status === 'in_progress') {
        const locallyManaged = isLocallyActive?.(streamId) ?? false;
        if (!locallyManaged) {
          const isAlive = await this.isStreamAlive(streamId);
          if (!isAlive) {
            getAgentLogger().warn(`[CatchUp] Orphaned stream detected`, { streamId });
            return {
              type: 'error',
              error: 'Stream is no longer active (server may have restarted)',
              requestId: streamId,
            };
          }
        }

        // Subscribe BEFORE getEvents to close the event gap
        unsubscribe = await this.subscribe(streamId, (msg) => {
          if (forwardHandler) {
            forwardHandler(msg);
          } else {
            buffer.push(msg);
          }
        });
      }

      const { events, lastEventSeq: retrievedLastEventSeq } = await this.getEvents(
        streamId,
        afterEventSeq,
      );

      let lastSentEventSeq = afterEventSeq;
      if (retrievedLastEventSeq > lastSentEventSeq) {
        lastSentEventSeq = retrievedLastEventSeq;
      }

      getAgentLogger().info(`[CatchUp] Starting catch-up`, {
        streamId,
        clientAfterEventSeq: afterEventSeq,
        streamStatus: metadata.status,
        totalEventsInMetadata: metadata.totalEvents,
        eventsRetrieved: events.length,
      });

      // Fire-and-forget: paced replay → drain → forward → terminate
      let totalSent = 0;
      let isTerminated = false;

      const sendContent = (content: unknown): void => {
        const seq = (content as { eventSeq?: number }).eventSeq ?? 0;
        if (seq > lastSentEventSeq) {
          lastSentEventSeq = seq;
        }
        totalSent++;
        transport.sendEvent(content, seq);
      };

      const terminate = (status: string, error?: string): void => {
        if (isTerminated) return;
        isTerminated = true;
        unsubscribe?.();

        getAgentLogger().info(`[CatchUp] Replay complete`, { streamId, totalSent, status });

        if (status === 'completed' || status === 'end') {
          transport.sendEnd();
        } else if (status === 'error') {
          transport.sendError(error || 'Stream ended with error');
        }
      };

      const processLiveMessage = (message: StreamEventMessage): void => {
        if (isTerminated) return;
        if (!transport.isOpen()) {
          terminate('completed');
          return;
        }

        if (message.type === 'event' && message.content) {
          const seq = (message.content as { eventSeq?: number }).eventSeq ?? 0;
          if (seq <= lastSentEventSeq) return;
          sendContent(message.content);
        } else if (message.type === 'end') {
          terminate('completed');
        } else if (message.type === 'error') {
          terminate('error', message.error);
        }
      };

      // Set up close handler
      transport.onClose(() => {
        if (!isTerminated) {
          isTerminated = true;
          unsubscribe?.();
        }
      });

      // Paced replay of stored events
      const sendPaced = (evts: unknown[]): Promise<void> => {
        return new Promise((resolve) => {
          let index = 0;
          const sendNext = () => {
            if (index < evts.length) {
              sendContent(evts[index++]);
              setTimeout(sendNext, EVENT_DELAY_MS);
            } else {
              resolve();
            }
          };
          sendNext();
        });
      };

      sendPaced(events).then(() => {
        if (metadata.status !== 'in_progress' || !unsubscribe) {
          terminate(metadata.status);
          return;
        }

        // Drain buffer + switch to live forwarding (synchronous — no events slip)
        for (const msg of buffer) {
          processLiveMessage(msg);
        }
        buffer.length = 0;
        forwardHandler = (msg) => processLiveMessage(msg);

        getAgentLogger().info(`[CatchUp] Switched to live forwarding for ${streamId}`, {
          totalSentAfterDrain: totalSent,
          lastSentEventSeq,
        });
      });

      return {
        type: 'resumed',
        requestId: streamId,
        lastEventSeq: lastSentEventSeq,
        status: metadata.status,
        totalEvents: metadata.totalEvents,
        replayedEvents: events.length,
      };
    } catch (error) {
      unsubscribe?.();
      throw error;
    }
  }
}
