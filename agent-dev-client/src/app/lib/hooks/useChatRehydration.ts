/**
 * Chat Rehydration Hook
 *
 * Initializes the chat session on page load.
 * Delegates to MessagesStore for WebSocket connection, content rehydration,
 * and welcome flow for fresh sessions.
 */

import { useEffect, useRef, useState } from 'react';
import { wsManager } from '../services/websocket-manager';
import { useMessagingStore } from './useMessagingStore';
import type { ConnectionStatus } from '../services/websocket-client.types';

export interface UseChatRehydrationOptions {
  /** Called when initialization completes successfully */
  onSuccess?: () => void;
  /** Called when initialization fails */
  onError?: (error: Error) => void;
}

export interface UseChatRehydrationResult {
  /** Whether initialization has completed and WebSocket is ready */
  isReady: boolean;
  /** Current connection status */
  connectionStatus: ConnectionStatus;
}

/**
 * Hook to initialize chat session on mount.
 * Handles WebSocket connection, content rehydration, and welcome flow.
 *
 * @example
 * ```tsx
 * function Chat() {
 *   const { isReady, connectionStatus } = useChatRehydration({
 *     onSuccess: () => console.log('Session initialized'),
 *   });
 *
 *   if (!isReady) return <Loading />;
 *   // ... rest of component
 * }
 * ```
 */
export function useChatRehydration(
  options: UseChatRehydrationOptions = {},
): UseChatRehydrationResult {
  const { onSuccess, onError } = options;
  const store = useMessagingStore();
  const [isReady, setIsReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    // Only initialize once per mount
    if (hasInitializedRef.current) {
      return;
    }
    hasInitializedRef.current = true;

    // Subscribe to connection status changes
    const unsubscribeStatus = wsManager.onStatusChange(setConnectionStatus);

    store
      .initializeSession()
      .then(() => {
        setIsReady(true);
        onSuccess?.();
      })
      .catch((error) => {
        console.error('[useChatRehydration] Failed to initialize:', error);
        onError?.(error instanceof Error ? error : new Error(String(error)));
      });

    // Cleanup on unmount
    return () => {
      unsubscribeStatus();
      wsManager.disconnect();
    };
  }, [store, onSuccess, onError]);

  return {
    isReady,
    connectionStatus,
  };
}
