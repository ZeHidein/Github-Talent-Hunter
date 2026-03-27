import {
  ContentType,
  copyContent,
  type AgentContent,
  type ComponentContent,
} from '../../types/content.ts';
import { StreamThrottler } from './stream-throttler.ts';

/**
 * Strategy for merging consecutive content items in UI state.
 */
export interface MergeStrategy {
  /** Determine if two content items should be merged */
  shouldMerge: (prev: AgentContent, next: AgentContent) => boolean;
  /** Merge two content items into one */
  merge: (prev: AgentContent, next: AgentContent) => AgentContent;
}

export interface MergeContentDeltasOptions {
  /**
   * Time to wait before flushing accumulated deltas (in milliseconds).
   * @default 16
   */
  flushTimeoutMs?: number;
}

/**
 * Merge consecutive delta events in an agent content stream.
 * Reduces SSE event frequency by combining:
 * - Component input-streaming deltas (by messageId)
 * - Reasoning text deltas (by messageId)
 *
 * Non-delta events are passed through immediately (after flushing any pending deltas).
 *
 * @example
 * ```typescript
 * for await (const content of mergeContentDeltas(stream)) {
 *   sendToClient(content);
 * }
 * ```
 */
export async function* mergeContentDeltas(
  stream: AsyncIterable<AgentContent>,
  options: MergeContentDeltasOptions = {},
): AsyncIterableIterator<AgentContent> {
  const throttler = new StreamThrottler({ batchTimeoutMs: options.flushTimeoutMs ?? 16 });

  yield* throttler.mergeDeltas(stream, {
    getKey: (content: AgentContent): string | null => {
      // Component input-streaming deltas
      if (
        content.type === ContentType.Component &&
        (content as ComponentContent).streaming?.state === 'input-streaming'
      ) {
        return `component:${content.messageId}`;
      }
      // Reasoning text deltas
      if (content.type === ContentType.Text && content.isReasoning) {
        return `reasoning:${content.messageId}`;
      }
      return null;
    },

    getDelta: (content: AgentContent): string => {
      if (content.type === ContentType.Component) {
        return (content as ComponentContent).streaming?.inputDelta ?? '';
      }
      if (content.type === ContentType.Text) {
        return content.content;
      }
      return '';
    },

    mergeDelta: (content: AgentContent, mergedDelta: string): AgentContent => {
      if (content.type === ContentType.Component) {
        const copied = copyContent(content) as ComponentContent;
        if (copied.streaming) {
          copied.streaming.inputDelta = mergedDelta;
        }
        return copied;
      }
      if (content.type === ContentType.Text) {
        const copied = copyContent(content);
        copied.content = mergedDelta;
        return copied;
      }
      return content;
    },
  });
}
