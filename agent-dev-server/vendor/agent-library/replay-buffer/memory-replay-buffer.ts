import { AbstractReplayBuffer } from './abstract-replay-buffer.ts';
import type { StartStreamOptions, StreamMetadata, StreamEventMessage } from './types.ts';
import { ContentType, type AgentContent, type TextContent } from '../types/content.ts';

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60_000;

export interface MemoryReplayBufferOptions {
  /** Time-to-live for completed streams. Default: 5 minutes. */
  ttlMs?: number;
  /** Safety cap — ring-overwrites oldest events when exceeded. Default: unlimited. */
  maxEvents?: number;
}

interface MemoryStream {
  metadata: StreamMetadata;
  events: unknown[];
  eventSeq: number;
  listeners: Set<(msg: StreamEventMessage) => void>;
  /** Maps messageId → index in events[] for O(1) text merge lookups. */
  textIndex: Map<string, number>;
  /** Ring buffer: write position (only used when maxEvents is set and events are full). */
  ringStart: number;
}

/**
 * Zero-dependency in-memory implementation of IReplayBuffer.
 * Suitable for development, testing, and single-instance deployments.
 *
 * Content-aware: automatically merges consecutive TextContent events
 * with the same messageId to reduce storage (compaction).
 */
export class MemoryReplayBuffer extends AbstractReplayBuffer {
  private streams = new Map<string, MemoryStream>();
  private cleanupTimer: ReturnType<typeof setInterval>;
  private ttlMs: number;
  private maxEvents?: number;

  constructor(options?: MemoryReplayBufferOptions) {
    super();
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEvents = options?.maxEvents;
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  async startStream(streamId: string, options?: StartStreamOptions): Promise<void> {
    const existing = this.streams.get(streamId);
    if (existing) {
      existing.metadata.status = 'in_progress';
      existing.metadata.completedAt = undefined;
      if (options?.responseId) existing.metadata.responseId = options.responseId;
      return;
    }

    this.streams.set(streamId, {
      metadata: {
        streamId,
        status: 'in_progress',
        startedAt: Date.now(),
        totalEvents: 0,
        responseId: options?.responseId,
      },
      events: [],
      eventSeq: 0,
      listeners: new Set(),
      textIndex: new Map(),
      ringStart: 0,
    });
  }

  async captureEvent(streamId: string, content: unknown): Promise<number> {
    const stream = this.streams.get(streamId);
    if (!stream) return 0;

    stream.eventSeq += 1;
    const seq = stream.eventSeq;
    (content as { eventSeq?: number }).eventSeq = seq;

    // Notify live subscribers BEFORE merge — they need every individual delta
    for (const listener of stream.listeners) {
      listener({ type: 'event', content, eventSeq: seq });
    }

    // Try to merge text content by messageId (storage compaction only)
    if (this.tryMergeText(stream, content)) {
      return seq;
    }

    // Append new event (with possible ring overwrite)
    this.appendEvent(stream, content);
    stream.metadata.totalEvents = this.countEvents(stream);

    return seq;
  }

  async endStream(streamId: string, error?: string): Promise<void> {
    const stream = this.streams.get(streamId);
    if (!stream) return;

    stream.metadata.status = error ? 'error' : 'completed';
    stream.metadata.completedAt = Date.now();
    if (error) {
      stream.metadata.error = error;
    }

    // Notify live subscribers
    const msg: StreamEventMessage = error ? { type: 'error', error } : { type: 'end' };
    for (const listener of stream.listeners) {
      listener(msg);
    }
  }

  finalizeStream(streamId: string): void {
    const stream = this.streams.get(streamId);
    if (stream) {
      stream.listeners.clear();
    }
  }

  async getMetadata(streamId: string): Promise<StreamMetadata | null> {
    return this.streams.get(streamId)?.metadata ?? null;
  }

  async getEvents(
    streamId: string,
    afterEventSeq?: number,
  ): Promise<{ events: unknown[]; lastEventSeq: number }> {
    const stream = this.streams.get(streamId);
    if (!stream) return { events: [], lastEventSeq: 0 };

    const allEvents = this.iterateEvents(stream);
    const filtered =
      afterEventSeq != null
        ? allEvents.filter((e) => ((e as { eventSeq?: number }).eventSeq ?? 0) > afterEventSeq)
        : allEvents;

    const lastEventSeq =
      filtered.length > 0
        ? ((filtered[filtered.length - 1] as { eventSeq?: number }).eventSeq ?? 0)
        : (afterEventSeq ?? 0);

    return { events: filtered, lastEventSeq };
  }

  async subscribe(
    streamId: string,
    onMessage: (message: StreamEventMessage) => void,
  ): Promise<() => void> {
    const stream = this.streams.get(streamId);
    if (!stream) return () => {};

    stream.listeners.add(onMessage);
    return () => {
      stream.listeners.delete(onMessage);
    };
  }

  async isStreamAlive(streamId: string): Promise<boolean> {
    const stream = this.streams.get(streamId);
    return stream?.metadata.status === 'in_progress';
  }

  async shutdown(): Promise<void> {
    clearInterval(this.cleanupTimer);
    this.streams.clear();
  }

  // ---------------------------------------------------------------------------
  // Text compaction
  // ---------------------------------------------------------------------------

  /**
   * If content is TextContent with a messageId, try to merge into an existing
   * event with the same messageId. Returns true if merged (caller should skip append).
   */
  private tryMergeText(stream: MemoryStream, content: unknown): boolean {
    if (!this.isTextContent(content)) return false;

    const messageId = content.messageId;
    if (!messageId) return false;

    const existingIndex = stream.textIndex.get(messageId);
    if (existingIndex === undefined) return false;

    const existing = stream.events[existingIndex];
    if (!existing || !this.isTextContent(existing)) return false;

    // Merge: concatenate for agent messages, replace for user messages
    const isUser = content.role === 'user' || existing.role === 'user';
    const mergedContent = isUser
      ? content.content || existing.content
      : existing.content + content.content;

    // Update in-place — preserve the original eventSeq of the first occurrence
    (existing as TextContent).content = mergedContent;
    if (content.role) (existing as TextContent).role = content.role;
    if (content.hidden) (existing as TextContent).hidden = content.hidden;
    if (content.isReasoning !== undefined)
      (existing as TextContent).isReasoning = content.isReasoning;

    return true;
  }

  private isTextContent(content: unknown): content is TextContent {
    return (
      content != null &&
      typeof content === 'object' &&
      (content as AgentContent).type === ContentType.Text
    );
  }

  // ---------------------------------------------------------------------------
  // Ring buffer helpers
  // ---------------------------------------------------------------------------

  private appendEvent(stream: MemoryStream, content: unknown): void {
    if (this.maxEvents && stream.events.length >= this.maxEvents) {
      // Ring overwrite oldest
      const overwriteIndex = stream.ringStart % this.maxEvents;
      const evicted = stream.events[overwriteIndex];

      // Remove evicted entry from textIndex if it had one
      if (this.isTextContent(evicted)) {
        const indexedAt = stream.textIndex.get(evicted.messageId);
        if (indexedAt === overwriteIndex) {
          stream.textIndex.delete(evicted.messageId);
        }
      }

      stream.events[overwriteIndex] = content;
      stream.ringStart++;

      // Index new entry if it's text
      if (this.isTextContent(content)) {
        stream.textIndex.set(content.messageId, overwriteIndex);
      }
    } else {
      const index = stream.events.length;
      stream.events.push(content);

      // Index new entry if it's text
      if (this.isTextContent(content)) {
        stream.textIndex.set(content.messageId, index);
      }
    }
  }

  /** Return events in insertion order (handles ring buffer wrap). */
  private iterateEvents(stream: MemoryStream): unknown[] {
    if (!this.maxEvents || stream.events.length < this.maxEvents) {
      return [...stream.events];
    }

    // Ring buffer: ringStart points to the oldest slot
    const cap = this.maxEvents;
    const start = stream.ringStart % cap;
    const result: unknown[] = [];
    for (let i = 0; i < cap; i++) {
      const idx = (start + i) % cap;
      if (stream.events[idx] != null) {
        result.push(stream.events[idx]);
      }
    }
    return result;
  }

  private countEvents(stream: MemoryStream): number {
    if (!this.maxEvents || stream.events.length < this.maxEvents) {
      return stream.events.length;
    }
    // Ring buffer is always full once we reach maxEvents
    return this.maxEvents;
  }

  // ---------------------------------------------------------------------------
  // TTL cleanup
  // ---------------------------------------------------------------------------

  private cleanup(): void {
    const now = Date.now();
    for (const [streamId, stream] of this.streams) {
      const completedAt = stream.metadata.completedAt;
      if (completedAt && now - completedAt > this.ttlMs) {
        this.streams.delete(streamId);
      }
    }
  }
}
