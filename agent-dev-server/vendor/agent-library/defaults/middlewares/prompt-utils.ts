import type {
  LanguageModelV3Message,
  LanguageModelV3Prompt,
  LanguageModelV3ToolCallPart,
  LanguageModelV3ToolResultPart,
} from '@ai-sdk/provider';
import type { ModelMessage } from '@ai-sdk/provider-utils';

export function isToolCallPart(part: unknown): part is LanguageModelV3ToolCallPart {
  return !!part && typeof part === 'object' && (part as { type?: unknown }).type === 'tool-call';
}

export function isToolResultPart(part: unknown): part is LanguageModelV3ToolResultPart {
  return !!part && typeof part === 'object' && (part as { type?: unknown }).type === 'tool-result';
}

interface MessageWithRole {
  role: string;
}

type TurnOf<T> = {
  requests: T[];
  responses: T[];
};

function groupByTurn<T extends MessageWithRole>(
  messages: readonly T[],
): {
  systemMessages: T[];
  turns: TurnOf<T>[];
} {
  if (!messages?.length) {
    return { systemMessages: [], turns: [] };
  }

  const systemMessages = messages.filter((m) => m.role === 'system');
  const nonSystem = messages.filter((m) => m.role !== 'system');

  const turns: TurnOf<T>[] = [];
  let lastRole: string | null = null;

  for (const msg of nonSystem) {
    if (msg.role === 'user') {
      if (lastRole !== 'user') {
        turns.push({ requests: [], responses: [] });
      }
      turns[turns.length - 1]!.requests.push(msg);
    } else {
      if (turns.length === 0) {
        turns.push({ requests: [], responses: [] });
      }
      turns[turns.length - 1]!.responses.push(msg);
    }
    lastRole = msg.role;
  }

  return { systemMessages, turns };
}

function flattenGenericTurns<T>(turns: TurnOf<T>[]): T[] {
  return turns.reduce((acc: T[], t) => acc.concat(t.requests, t.responses), []);
}

/**
 * Drops ~50% of removable middle turns, preserving system messages,
 * the first turn, and the last N turns.
 */
function dropMiddleTurnsGeneric<T extends MessageWithRole>(
  messages: readonly T[],
  preserveLastNTurns: number,
): T[] {
  if (!messages?.length) {
    return messages as T[];
  }

  const { systemMessages, turns } = groupByTurn(messages);

  if (turns.length <= 1 + preserveLastNTurns) {
    return messages as T[];
  }

  const removableCount = turns.length - 1 - preserveLastNTurns;
  if (removableCount <= 0) {
    return messages as T[];
  }

  const removeSize = Math.max(1, Math.floor(removableCount / 2));
  const startInRemovable = Math.floor((removableCount - removeSize) / 2);
  const removeStart = 1 + startInRemovable;
  const removeEnd = removeStart + removeSize - 1;

  const keptTurns = turns.slice(0, removeStart).concat(turns.slice(removeEnd + 1));
  const flattened = flattenGenericTurns(keptTurns);

  return systemMessages.length ? [...systemMessages, ...flattened] : flattened;
}

/** @deprecated Prefer `TurnOf<LanguageModelV3Message>` */
export type Turn = TurnOf<LanguageModelV3Message>;

export function groupMessagesByTurn(prompt: LanguageModelV3Prompt): {
  systemMessages: LanguageModelV3Message[];
  turns: TurnOf<LanguageModelV3Message>[];
} {
  return groupByTurn(prompt);
}

export function flattenTurns(turns: TurnOf<LanguageModelV3Message>[]): LanguageModelV3Message[] {
  return flattenGenericTurns(turns);
}

export function dropMiddleTurns(
  prompt: LanguageModelV3Prompt,
  preserveLastNTurns: number,
): LanguageModelV3Prompt {
  return dropMiddleTurnsGeneric(prompt, preserveLastNTurns);
}

export function dropMiddleTurnsModelMessages(
  messages: ModelMessage[],
  preserveLastNTurns: number,
): ModelMessage[] {
  return dropMiddleTurnsGeneric(messages, preserveLastNTurns);
}

/** Limits a prompt to the last N turns, keeping all system messages. */
export function limitPromptByTurns(
  prompt: LanguageModelV3Prompt,
  turnsLimit: number,
): LanguageModelV3Prompt {
  if (!prompt?.length) {
    return [];
  }
  if (!turnsLimit || turnsLimit <= 0) {
    return prompt;
  }

  const { systemMessages, turns } = groupByTurn(prompt);
  const sliced = flattenGenericTurns(turns.slice(-turnsLimit));

  return systemMessages.length ? [...systemMessages, ...sliced] : sliced;
}
