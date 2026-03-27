/**
 * Server-specific AgentState
 *
 * Uses agent-library's AgentState as the base, with server-specific data
 * stored in the `app` context. This allows seamless integration with
 * ToolLoopAgentRunner while preserving server-specific functionality.
 */
import {
  AgentState as BaseAgentState,
  type Attachment,
  type AgentRunInput,
  type AgentContent,
} from './agent-library';
import type { PreviewMessageT } from '../../types';
import type { RequestContext } from '../../context';

/**
 * Application state for agent-dev-server.
 * Stored in AgentState.app field - completely opaque to agent-library kernel.
 */
export interface DevServerAppState {
  agentId: string;
  userQuery?: AgentContent;
  requestMetadata?: Record<string, unknown>;
  files: Attachment[];
  renderedMessages: PreviewMessageT[];
  generatedImages: Map<string, string>;
  thinking?: { type: 'enabled'; budget_tokens: number };
  context?: RequestContext;
}

// ============================================================================
// Helper functions for working with DevServerAppState
// ============================================================================

export function getDevServerAppState(
  state: BaseAgentState<unknown, DevServerAppState>,
): DevServerAppState | null {
  return state.getApp<DevServerAppState>() ?? null;
}

export function getAgentId(state: BaseAgentState<unknown, DevServerAppState>): string {
  return getDevServerAppState(state)?.agentId ?? '';
}

export function getContext(
  state: BaseAgentState<unknown, DevServerAppState>,
): RequestContext | undefined {
  return getDevServerAppState(state)?.context;
}

export function getSessionKey(
  state: BaseAgentState<unknown, DevServerAppState>,
): string | undefined {
  return getContext(state)?.getSessionKey();
}

export function getFiles(state: BaseAgentState<unknown, DevServerAppState>): Attachment[] {
  return getDevServerAppState(state)?.files ?? [];
}

export function getRenderedMessages(
  state: BaseAgentState<unknown, DevServerAppState>,
): PreviewMessageT[] {
  return getDevServerAppState(state)?.renderedMessages ?? [];
}

export function getUserQuery(
  state: BaseAgentState<unknown, DevServerAppState>,
): AgentContent | undefined {
  return getDevServerAppState(state)?.userQuery;
}

export function getRequestMetadata(
  state: BaseAgentState<unknown, DevServerAppState>,
): Record<string, unknown> | undefined {
  return getDevServerAppState(state)?.requestMetadata;
}

export function getThinking(
  state: BaseAgentState<unknown, DevServerAppState>,
): { type: 'enabled'; budget_tokens: number } | undefined {
  return getDevServerAppState(state)?.thinking;
}

export function storeGeneratedImage(
  state: BaseAgentState<unknown, DevServerAppState>,
  imageId: string,
  base64Data: string,
): void {
  const app = getDevServerAppState(state);
  if (app) {
    app.generatedImages.set(imageId, base64Data);
  }
}

export function getGeneratedImage(
  state: BaseAgentState<unknown, DevServerAppState>,
  imageId: string,
): string | undefined {
  return getDevServerAppState(state)?.generatedImages.get(imageId);
}

export function hasGeneratedImage(
  state: BaseAgentState<unknown, DevServerAppState>,
  imageId: string,
): boolean {
  return getDevServerAppState(state)?.generatedImages.has(imageId) ?? false;
}

// ============================================================================
// Legacy compatibility: export BaseAgentState as default
// ============================================================================

export default BaseAgentState;

// Re-export types from agent-library
export type { AgentRunInput, Attachment };
