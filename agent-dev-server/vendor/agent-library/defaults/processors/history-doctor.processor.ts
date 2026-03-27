import type { ModelMessage } from '@ai-sdk/provider-utils';
import type { TurnProcessor, TurnProcessorState } from '../../kernel/processors/types.ts';
import {
  isToolCallPartLike,
  isToolResultPartLike,
} from '../middlewares/tool-payload-truncation.ts';

/**
 * Checks whether a tool-call `input` value is a broken (unparseable) JSON string.
 *
 * This happens when the model hits `max_tokens` mid-generation and the AI SDK
 * stores the incomplete JSON string as-is. Such entries break all subsequent
 * API calls because the provider cannot parse the malformed input.
 *
 * Only strings that *look* like JSON (start with `{` or `[`) are tested —
 * plain strings and object inputs are left alone.
 */
function isBrokenJsonInput(input: unknown): boolean {
  if (typeof input !== 'string') {
    return false;
  }
  const trimmed = input.trimStart();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return false;
  }
  try {
    JSON.parse(trimmed);
    return false; // valid JSON string — not broken
  } catch {
    return true; // looks like JSON but fails to parse
  }
}

/**
 * HistoryDoctorProcessor
 *
 * Sanitizes conversation history before each turn by removing tool-call parts
 * with broken/partial JSON `input` values (and their orphaned tool-result
 * counterparts).
 *
 * Returns `null` when no broken entries are found (no-op / idempotent).
 */
export class HistoryDoctorProcessor implements TurnProcessor {
  async process(state: TurnProcessorState): Promise<ModelMessage[] | null> {
    const history = state.getConversationHistory();

    // 1. Collect broken toolCallIds
    const brokenIds = new Set<string>();

    for (const msg of history) {
      if (
        msg.role !== 'assistant' ||
        typeof msg.content === 'string' ||
        !Array.isArray(msg.content)
      ) {
        continue;
      }
      for (const part of msg.content) {
        if (isToolCallPartLike(part) && isBrokenJsonInput(part.input)) {
          brokenIds.add(part.toolCallId);
        }
      }
    }

    // 2. No broken entries — nothing to do
    if (brokenIds.size === 0) {
      return null;
    }

    // 3. Filter history
    const cleaned: ModelMessage[] = [];

    for (const msg of history) {
      if (typeof msg.content === 'string' || !Array.isArray(msg.content)) {
        cleaned.push(msg);
        continue;
      }

      if (msg.role === 'assistant') {
        const filteredContent = msg.content.filter((part) => {
          if (isToolCallPartLike(part) && brokenIds.has(part.toolCallId)) {
            return false;
          }
          return true;
        });
        if (filteredContent.length > 0) {
          cleaned.push({ ...msg, content: filteredContent } as ModelMessage);
        }
        // else: empty assistant message after cleanup — drop it
        continue;
      }

      if (msg.role === 'tool') {
        const filteredContent = msg.content.filter((part) => {
          if (isToolResultPartLike(part) && brokenIds.has(part.toolCallId)) {
            return false;
          }
          return true;
        });
        if (filteredContent.length > 0) {
          cleaned.push({ ...msg, content: filteredContent } as ModelMessage);
        }
        // else: empty tool message after cleanup — drop it
        continue;
      }

      // user, system, etc. — pass through
      cleaned.push(msg);
    }

    return cleaned;
  }
}
