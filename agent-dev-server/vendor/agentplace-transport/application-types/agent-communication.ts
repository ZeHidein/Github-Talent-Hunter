/**
 * Agent Communication Message Types
 * Using Action-Based naming convention for iframe transport
 *
 * These types are used for communication between:
 * - Admin-client (builder) ↔ Agent-dev-client (preview agent)
 *
 * NOTE: These are application-level types, not generic transport types.
 * They're included in agentplace-transport for convenience since this library
 * is copied to consumers who may not have access to shared-types.
 */

// ============================================================================
// Message Type Constants
// ============================================================================

/**
 * Constants for agent communication message types
 * Use these instead of string literals to avoid typos
 */
export const AgentMessageTypes = Object.freeze({
  // Notify types (fire-and-forget)
  AGENT_MESSAGE_SEND: 'agent.message.send' as const,

  // Ask types (request-response)
  AGENT_MESSAGE_QUERY: 'agent.message.query' as const,
  AGENT_HEALTH_PING: 'agent.health.ping' as const,
  AGENT_RELOAD: 'agent.reload' as const,
} as const);

// ============================================================================
// Notify Messages (Fire-and-forget, no response expected)
// ============================================================================

/**
 * Send a message to the agent without waiting for response
 */
export type AgentMessageSend = {
  type: 'agent.message.send';
  message: string;
};

/**
 * Union of all notify message types
 */
export type AgentNotifyMessage = AgentMessageSend;

// ============================================================================
// Ask Messages (Request-response, waits for response)
// ============================================================================

/**
 * Query the agent with a message and wait for response
 */
export type AgentMessageQuery = {
  type: 'agent.message.query';
  message: string;
};

/**
 * Health check / connectivity test
 */
export type AgentHealthPing = {
  type: 'agent.health.ping';
};

/**
 * Reload the agent (clear conversation and reinitialize)
 */
export type AgentReload = {
  type: 'agent.reload';
};

/**
 * Union of all ask message types
 */
export type AgentAskMessage = AgentMessageQuery | AgentHealthPing | AgentReload;

// ============================================================================
// Response Types
// ============================================================================

/**
 * Response from agent.message.query
 */
export type AgentMessageQueryResponse = {
  success: boolean;
  responses: Array<{
    type: string;
    role: string;
    content: unknown;
    componentName?: string;
    uiText?: string;
  }>;
  userMessage: string;
  error?: string;
};

/**
 * Response from agent.health.ping
 */
export type AgentHealthPingResponse = {
  status: 'pong';
};

/**
 * Response from agent.reload
 */
export type AgentReloadResponse = {
  success: boolean;
  message: string;
};

/**
 * Union of all response types
 */
export type AgentAskResponse =
  | AgentMessageQueryResponse
  | AgentHealthPingResponse
  | AgentReloadResponse;
