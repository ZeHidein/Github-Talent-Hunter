// =============================================================================
// Wire protocol: server → client notifications
// =============================================================================

export interface StreamEventNotification {
  type: 'stream';
  requestId: string;
  eventSeq: number;
  content: unknown;
}

export interface StreamEndNotification {
  type: 'streamEnd';
  requestId: string;
}

export interface StreamErrorNotification {
  type: 'streamError';
  requestId: string;
  error: string;
}

export type StreamNotification =
  | StreamEventNotification
  | StreamEndNotification
  | StreamErrorNotification;

// =============================================================================
// Wire protocol: client → server actions
// =============================================================================

export interface SubscribeAction {
  type: 'subscribe';
  requestId: string;
}

export interface ResumeAction {
  type: 'resume';
  requestId: string;
  lastEventSeq?: number;
}

export interface AbortAction {
  type: 'abort';
  requestId?: string;
  responseId?: string;
}

export type StreamAction = SubscribeAction | ResumeAction | AbortAction;

// =============================================================================
// Wire protocol: server → client catch-up response
// =============================================================================

export interface CatchUpResult {
  type: 'resumed' | 'error';
  requestId: string;
  lastEventSeq?: number;
  status?: string;
  totalEvents?: number;
  replayedEvents?: number;
  skipped?: boolean;
  reason?: string;
  error?: string;
}
