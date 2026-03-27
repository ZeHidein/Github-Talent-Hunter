/**
 * Event Processor
 *
 * Standalone utilities for processing agent events without state management.
 * Use these if you want to build custom conversation handling.
 *
 * @example
 * ```typescript
 * // Custom implementation using primitives
 * let lastStateUpdate: Record<string, unknown> = {};
 *
 * function handleEvent(payload: AgentMessagePayload) {
 *   const result = processAgentEvent(payload);
 *
 *   if (result.type === 'state-update') {
 *     lastStateUpdate = result.data;
 *   } else if (result.type === 'system-tool') {
 *     handleSystemTool(result.toolName, result.data);
 *   } else if (result.type === 'content') {
 *     dispatch({ type: 'append', content: result.content });
 *   }
 * }
 * ```
 */

import { ContentType, type AgentContent, createTextContent } from '../types/content.ts';

import type { AgentMessagePayload } from './types.ts';

const STATE_UPDATE_TOOL = 'StateUpdate';

/**
 * Result of processing an agent event.
 */
export type ProcessEventResult =
  | { type: 'state-update'; data: Record<string, unknown> }
  | { type: 'system-tool'; toolName: string; data: unknown }
  | { type: 'content'; content: AgentContent }
  | { type: 'ignored' };

/**
 * Process a single agent event.
 *
 * This is a pure function that handles protocol logic without side effects.
 * You manage state (lastStateUpdate) yourself.
 *
 * @param payload - The incoming SSE event payload
 * @returns Result object indicating what action to take
 *
 * @example
 * ```typescript
 * eventSource.onmessage = (event) => {
 *   const payload = JSON.parse(event.data);
 *   const result = processAgentEvent(payload);
 *
 *   switch (result.type) {
 *     case 'state-update':
 *       saveStateUpdate(result.data);
 *       break;
 *     case 'system-tool':
 *       handleTool(result.toolName, result.data);
 *       break;
 *     case 'content':
 *       addToMessages(result.content);
 *       break;
 *   }
 * };
 * ```
 */
export function processAgentEvent(payload: AgentMessagePayload): ProcessEventResult {
  // 1. Handle StateUpdate (protocol)
  if (payload.type === ContentType.Tool) {
    const toolPayload = payload as AgentMessagePayload & {
      tool: { name: string };
      content: unknown;
    };
    if (toolPayload.tool?.name === STATE_UPDATE_TOOL) {
      return {
        type: 'state-update',
        data: toolPayload.content as Record<string, unknown>,
      };
    }

    // 2. Other system tools
    return {
      type: 'system-tool',
      toolName: toolPayload.tool.name,
      data: toolPayload.content,
    };
  }

  // 3. Handle text
  if (payload.type === ContentType.Text) {
    const content = createTextContent({
      messageId: payload.messageId,
      responseId: payload.responseId,
      content: payload.content as string,
      isReasoning: payload.isReasoning,
      role: payload.role,
      hidden: payload.hidden,
    });
    return { type: 'content', content };
  }

  // 4. Handle Component (unified type - simple UI or streaming tool)
  if (payload.type === ContentType.Component) {
    const content = payload as AgentContent;
    return { type: 'content', content };
  }

  return { type: 'ignored' };
}

/**
 * Check if a tool should be hidden (not create visible message).
 */
export function isHiddenSystemTool(
  payload: AgentMessagePayload,
  hiddenTools: string[] = ['StateUpdate', 'UpdateChecklist'],
): boolean {
  if (payload.type !== ContentType.Tool) {
    return false;
  }
  const toolPayload = payload as AgentMessagePayload & { tool?: { name: string } };
  return hiddenTools.includes(toolPayload.tool?.name || '');
}

/**
 * Extract StateUpdate data from a payload if present.
 */
export function extractStateUpdate(payload: AgentMessagePayload): Record<string, unknown> | null {
  if (payload.type === ContentType.Tool) {
    const toolPayload = payload as AgentMessagePayload & {
      tool?: { name: string };
      content: unknown;
    };
    if (toolPayload.tool?.name === STATE_UPDATE_TOOL) {
      return toolPayload.content as Record<string, unknown>;
    }
  }
  return null;
}
