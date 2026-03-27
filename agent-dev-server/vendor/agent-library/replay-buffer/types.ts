import type { CatchUpResult } from '../streaming/protocol.ts';

/** Stream metadata (implementation-agnostic — no Redis chunk/ID fields). */
export interface StreamMetadata {
  streamId: string;
  status: 'in_progress' | 'completed' | 'error';
  startedAt: number;
  completedAt?: number;
  totalEvents: number;
  error?: string;
  responseId?: string;
}

export interface StartStreamOptions {
  responseId?: string;
}

/** Internal pub/sub message between replay buffer nodes. */
export interface StreamEventMessage {
  type: 'event' | 'end' | 'error';
  content?: unknown;
  eventSeq?: number;
  error?: string;
}

/** Transport contract: how events reach the client. */
export interface StreamTransport {
  sendEvent(content: unknown, eventSeq: number): void;
  sendEnd(): void;
  sendError(error: string): void;
  isOpen(): boolean;
  onClose(callback: () => void): void;
}

export interface CatchUpOptions {
  streamId: string;
  transport: StreamTransport;
  afterEventSeq?: number;
  isLocallyActive?: (streamId: string) => boolean;
}

export interface IReplayBuffer {
  // --- Write path ---
  startStream(streamId: string, options?: StartStreamOptions): Promise<void>;
  /** Captures an event and returns the assigned eventSeq. */
  captureEvent(streamId: string, content: unknown): Promise<number>;
  endStream(streamId: string, error?: string): Promise<void>;
  /** Cleanup in-memory state. MUST be called when stream is fully done. */
  finalizeStream(streamId: string): void;

  // --- Read path ---
  getMetadata(streamId: string): Promise<StreamMetadata | null>;
  getEvents(
    streamId: string,
    afterEventSeq?: number,
  ): Promise<{ events: unknown[]; lastEventSeq: number }>;

  // --- Live subscription ---
  subscribe(
    streamId: string,
    onMessage: (message: StreamEventMessage) => void,
  ): Promise<() => void>;

  // --- Health ---
  isStreamAlive(streamId: string): Promise<boolean>;

  // --- Catch-up (orchestrates read + subscribe + delivery) ---
  catchUp(options: CatchUpOptions): Promise<CatchUpResult>;

  // --- Lifecycle ---
  shutdown(): Promise<void>;
}
