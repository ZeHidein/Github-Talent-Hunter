/**
 * Message Grouper
 *
 * Groups messages into user request + agent responses pairs.
 * This is useful for UI rendering where each exchange is displayed together.
 */

import type { AgentContent } from '../types/content.ts';
import type { MessageGroup } from './types.ts';

/**
 * Determine if a message is a user message.
 *
 * Convention: User messages have type 'TXT' and content is a string,
 * or have a role property set to 'user'.
 * Agent messages are everything else.
 */
function isUserMessage(content: AgentContent): boolean {
  // Check for explicit role if present (from UI message format)
  if ('role' in content && (content as { role?: string }).role === 'user') {
    return true;
  }
  return false;
}

/**
 * Compute message groups from a flat list of messages.
 *
 * Groups consecutive agent responses under the user message that triggered them.
 * Initial agent messages (before any user message) form a group with null request.
 *
 * @example
 * ```typescript
 * const groups = computeMessageGroups(messages);
 * // [
 * //   { id: '1', request: userMsg1, responses: [agentMsg1, agentMsg2] },
 * //   { id: '2', request: userMsg2, responses: [agentMsg3] },
 * // ]
 * ```
 */
export function computeMessageGroups(messages: AgentContent[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let currentGroup: MessageGroup | null = null;
  let groupId = 0;

  for (const message of messages) {
    if (isUserMessage(message)) {
      // Start new group with this user message
      currentGroup = {
        id: `group-${++groupId}`,
        request: message,
        responses: [],
      };
      groups.push(currentGroup);
    } else {
      // Agent message
      if (!currentGroup) {
        // No user message yet, create group with null request
        currentGroup = {
          id: `group-${++groupId}`,
          request: null,
          responses: [],
        };
        groups.push(currentGroup);
      }
      currentGroup.responses.push(message);
    }
  }

  return groups;
}

/**
 * Get the last message group from a list of messages.
 *
 * Convenience helper that computes groups and returns the most recent one.
 * Useful for accessing the latest user request and its responses.
 *
 * @param messages - Flat array of agent content messages
 * @returns The last message group, or undefined if no messages
 *
 * @example
 * ```typescript
 * const lastGroup = getLastGroup(conversation.messages);
 * if (lastGroup?.request) {
 *   console.log('Last user message:', lastGroup.request.content);
 *   console.log('Agent responses:', lastGroup.responses.length);
 * }
 * ```
 */
export function getLastGroup(messages: AgentContent[]): MessageGroup | undefined {
  const groups = computeMessageGroups(messages);
  return groups[groups.length - 1];
}

/**
 * Get all agent responses from the most recent exchange.
 *
 * Convenience helper that returns only the responses from the last group,
 * without the user request. Returns empty array if no messages.
 *
 * @param messages - Flat array of agent content messages
 * @returns Array of agent responses from the last exchange
 *
 * @example
 * ```typescript
 * const responses = getLastResponses(conversation.messages);
 * const textResponses = responses.filter(r => r.type === ContentType.Text);
 * ```
 */
export function getLastResponses(messages: AgentContent[]): AgentContent[] {
  const lastGroup = getLastGroup(messages);
  return lastGroup?.responses || [];
}
