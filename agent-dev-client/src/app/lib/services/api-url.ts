/**
 * Check if running in local/preview dev environment
 */
export const isDevEnvironment = () => {
  return location.hostname === 'localhost' || location.hostname.includes('preview');
};

/**
 * Get the base URL for API requests.
 * Uses relative URL since client is served by the same server that handles API.
 */
export const getApiBaseUrl = () => {
  return '/api';
};

/**
 * Get the base URL for WebSocket connections (without /api path).
 * Uses current origin since client is served by the same server.
 */
export const getWsBaseUrl = () => {
  const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${location.host}`;
};
