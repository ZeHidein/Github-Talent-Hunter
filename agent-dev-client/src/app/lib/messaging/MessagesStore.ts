import { observable, computed, action } from 'mobx';
import { BProgress } from '@bprogress/core';

import type { UserMessagePayloadT, SendMessagePropsT } from '@/app/lib/types';

import type { NotificationStore } from './NotificationsStore';
import type { MemoryStore } from './MemoryStore';
import { trpc } from '@/app/lib/trpc';
import { wsManager } from '@/app/lib/services/websocket-manager';
import type { AgentStreamContent } from '@/app/lib/services/websocket-client.types';
import {
  ContentType,
  type AgentContent,
  type AgentMessagePayload,
  type ComponentContent,
  type MessageGroup,
  type ConversationState,
  computeMessageGroups,
  AgentConversation,
} from '@/lib/agent-library';

const VOICE_TOOL_NAME = 'playVoiceAssistance';
const MEMORY_BANK_TOOL_NAME = 'persistToMemoryBank';
const INITIAL_MESSAGE_TEXT = '[user opened the agent]';

BProgress.configure({
  showSpinner: false,
});

interface PendingResolver {
  resolve: () => void;
  reject: (error: Error) => void;
}

interface CurrentRequest {
  responseId: string | null;
  status: 'starting' | 'streaming' | 'aborting';
  completion: PendingResolver;
}

export class MessagesStore {
  @observable accessor userRequestPending = false;
  @observable accessor lastVoiceText = '';
  @observable accessor speechEnabled = false;
  @observable accessor isRecordingAudio = false;
  @observable accessor lastUpdatedComponentId: string | null = null;
  @observable accessor lastPopulatedComponentId: string | null = null;
  @observable.ref accessor messages: AgentContent[] = [];

  private conversation: AgentConversation;
  private currentRequest: CurrentRequest | null = null;
  private hasInitializedSession = false;
  private unsubscribeContent: (() => void) | null = null;

  readonly notificationsStore: NotificationStore;
  readonly memoryStore: MemoryStore;

  constructor({
    notificationsStore,
    memoryStore,
  }: {
    notificationsStore: NotificationStore;
    memoryStore: MemoryStore;
  }) {
    this.notificationsStore = notificationsStore;
    this.memoryStore = memoryStore;

    this.conversation = new AgentConversation({
      onStateChange: action((state: ConversationState) => {
        this.messages = state.messages;
      }),
    });
  }

  @computed
  get groupedMessages(): MessageGroup[] {
    return computeMessageGroups(this.messages);
  }

  @computed
  get visibleGroupedMessages(): MessageGroup[] {
    return computeMessageGroups(this.messages);
  }

  @computed
  get contents(): AgentContent[] {
    return this.messages;
  }

  @action.bound
  resetToInitialState() {
    this.resetComponentTracking();
  }

  @action.bound
  processContent(content: AgentStreamContent) {
    if (this.handleSystemContent(content)) {
      return;
    }

    if (content.type === 'finish' || content.type === 'error') {
      return;
    }

    this.conversation.process(content as AgentMessagePayload);
  }

  @action.bound
  async sendMessage(props: SendMessagePropsT): Promise<void> {
    if (this.userRequestPending) {
      await this.abortCurrentRequest({ waitForServerAck: true });
    }

    try {
      this.setUserRequestPending(true);
      const completionPromise = this.createCompletionPromise();

      const messagePayload = this.createMessagePayload(props);

      await this.transcribeAudioIfNeeded(messagePayload);
      const content = this.extractMessageContent(messagePayload);
      const metadata = this.createRequestMetadata(props, messagePayload);

      const result = await wsManager.sendMessage(content, { files: props.files, metadata });
      if (this.currentRequest) {
        this.currentRequest.responseId = result?.responseId ?? null;
        this.currentRequest.status = 'streaming';
      }
      await completionPromise;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'CanceledError') {
        return;
      }
      this.currentRequest = null;
      this.setUserRequestPending(false);
      throw error;
    }
  }

  /**
   * Query-mode send: behaves like `sendMessage()` from a UI perspective
   * (pending/progress), but also returns a `responseId` for correlation.
   *
   * The caller is responsible for awaiting `done` to know when the request finished.
   */
  @action.bound
  async sendMessageForQuery(
    props: SendMessagePropsT,
  ): Promise<{ responseId: string; done: Promise<void> }> {
    if (this.userRequestPending) {
      throw new Error('Message already pending');
    }

    try {
      this.setUserRequestPending(true);
      const done = this.createCompletionPromise();

      const messagePayload = this.createMessagePayload(props);

      await this.transcribeAudioIfNeeded(messagePayload);
      const content = this.extractMessageContent(messagePayload);
      const metadata = this.createRequestMetadata(props, messagePayload);

      // Ensure WS is connected (idempotent, avoids depending on session init timing).
      await wsManager.connect();

      const { responseId } = await wsManager.sendMessageForQuery(content, {
        files: props.files,
        metadata,
        hidden: content?.includes(INITIAL_MESSAGE_TEXT),
      });
      if (this.currentRequest) {
        this.currentRequest.responseId = responseId;
        this.currentRequest.status = 'streaming';
      }
      return { responseId, done };
    } catch (error: unknown) {
      this.currentRequest = null;
      this.setUserRequestPending(false);
      throw error;
    }
  }

  @action.bound
  stopStreaming() {
    void this.abortCurrentRequest({ waitForServerAck: false });
  }

  /**
   * Initialize session: connect WebSocket, subscribe to content, and either
   * rehydrate existing content or trigger welcome flow for fresh sessions.
   */
  @action.bound
  async initializeSession(): Promise<void> {
    if (this.hasInitializedSession) {
      return;
    }
    this.hasInitializedSession = true;

    await wsManager.connect();

    if (!this.unsubscribeContent) {
      this.unsubscribeContent = wsManager.onContent((content) => {
        this.processContent(content);
      });

      wsManager.onReconnect((resume) => {
        this.conversation.restore({
          messages: resume.contents.map((c) => c.content),
          lastStateUpdate: this.conversation.getLastStateUpdate(),
        });
        this.resetToInitialState();
        wsManager.getSessionInfo().then(
          action((info) => {
            if (info.status === 'idle' && this.currentRequest) {
              this.resolvePendingRequest();
              this.setUserRequestPending(false);
            }
          }),
        );
      });
    }

    const buffered: AgentStreamContent[] = [];
    let isRestoring = true;
    const unsubscribeRestoreBuffer = wsManager.onContent((content) => {
      if (isRestoring) {
        buffered.push(content);
      }
    });

    const [resumeResult, sessionInfo] = await Promise.all([
      wsManager.resumeContent(),
      wsManager.getSessionInfo(),
    ]);

    this.conversation.restore({
      messages: resumeResult.contents.map((c) => c.content),
      lastStateUpdate: {},
    });

    this.resetToInitialState();
    isRestoring = false;
    unsubscribeRestoreBuffer();

    for (const content of buffered) {
      this.processContent(content);
    }

    if (resumeResult.contents.length === 0) {
      this.sendWelcomeMessage().catch((error) => {
        console.error('[MessagesStore] Welcome message failed:', error);
      });
    }

    if (sessionInfo.status === 'processing') {
      this.setUserRequestPending(true);
      this.currentRequest = {
        responseId: null,
        status: 'streaming',
        completion: {
          resolve: () => {},
          reject: () => {},
        },
      };
    }
  }

  /**
   * Sends the welcome message with memory bank to trigger the agent's initial greeting.
   * Called automatically on fresh sessions (no prior content).
   */
  @action.bound
  private async sendWelcomeMessage(): Promise<void> {
    if (this.userRequestPending) {
      return;
    }

    this.setUserRequestPending(true);

    const completionPromise = new Promise<void>((resolve, reject) => {
      this.currentRequest = {
        responseId: null,
        status: 'starting',
        completion: { resolve, reject },
      };
    });

    try {
      const memoryBank = this.memoryStore.getAll();
      const result = await wsManager.sendMessage('', {
        memoryBank,
        hidden: true,
        metadata: {
          systemMessage: INITIAL_MESSAGE_TEXT,
          requestType: 'agent_opened',
        },
      });
      if (this.currentRequest) {
        this.currentRequest.responseId = result?.responseId ?? null;
        this.currentRequest.status = 'streaming';
      }

      await completionPromise;
    } catch (error: unknown) {
      this.currentRequest = null;
      this.setUserRequestPending(false);
      throw error;
    }
  }

  @action.bound
  clearMessages() {
    this.lastVoiceText = '';

    void this.abortCurrentRequest({ waitForServerAck: false, reason: 'Messages cleared' });

    this.userRequestPending = false;
    this.lastUpdatedComponentId = null;
    this.lastPopulatedComponentId = null;
    this.conversation.clear();
    this.messages = [];
  }

  private async abortCurrentRequest(options?: {
    waitForServerAck?: boolean;
    reason?: string;
  }): Promise<void> {
    const request = this.currentRequest;
    if (!request) {
      this.setUserRequestPending(false);
      return;
    }

    request.status = 'aborting';
    const responseId = request.responseId;
    const waitForServerAck = options?.waitForServerAck ?? false;

    if (responseId) {
      const abortPromise = wsManager.abortStream(responseId).catch(() => {});
      if (waitForServerAck) {
        await abortPromise;
      }
    }

    const error = new Error(options?.reason ?? 'Request was cancelled');
    error.name = 'CanceledError';
    request.completion.reject(error);

    // Clear only if still pointing to the same request.
    if (this.currentRequest === request) {
      this.currentRequest = null;
    }
    this.setUserRequestPending(false);
  }

  @action.bound
  clearPageContent() {
    this.resetComponentTracking();
  }

  @action.bound
  toggleSpeech() {
    this.speechEnabled = !this.speechEnabled;
    if (!this.speechEnabled) {
      this.isRecordingAudio = false;
    }
  }

  @action.bound
  toggleRecordingAudio(isRecording: boolean) {
    this.isRecordingAudio = isRecording;
  }

  @action.bound
  updateLastVoiceText(text: string) {
    this.lastVoiceText = text;
  }

  @action.bound
  setLastUpdatedComponentId(componentId: string | null) {
    this.lastUpdatedComponentId = componentId;
  }

  @action.bound
  setLastPopulatedComponentId(componentId: string | null) {
    this.lastPopulatedComponentId = componentId;
  }

  @action.bound
  private handleSystemContent(content: AgentStreamContent): boolean {
    if (content.type === 'finish') {
      const responseId = (content as { responseId?: string }).responseId;
      // Ignore stale terminal events for old streams.
      if (
        this.currentRequest?.responseId &&
        responseId &&
        responseId !== this.currentRequest.responseId
      ) {
        return true;
      }
      // While a request is starting, ignore terminal events until correlated.
      if (this.currentRequest?.status === 'starting' && responseId) {
        return true;
      }
      this.finalizeStaleTools();
      this.resolvePendingRequest();
      this.setUserRequestPending(false);
      return true;
    }

    if (content.type === 'error') {
      const responseId = (content as { responseId?: string }).responseId;
      // Ignore stale terminal events for old streams.
      if (
        this.currentRequest?.responseId &&
        responseId &&
        responseId !== this.currentRequest.responseId
      ) {
        return true;
      }
      // While a request is starting, ignore terminal events until correlated.
      if (this.currentRequest?.status === 'starting' && responseId) {
        return true;
      }
      const errorMessage = content.error || 'Unknown error';
      this.rejectPendingRequest(new Error(errorMessage));
      this.setUserRequestPending(false);
      return true;
    }

    if (content.type === ContentType.Component) {
      const componentContent = content as ComponentContent;
      const toolName = componentContent.streaming?.toolName;

      if (toolName === VOICE_TOOL_NAME) {
        const text = componentContent.props?.text as string | undefined;
        if (text) {
          this.updateLastVoiceText(text);
        }
        return true;
      }

      if (toolName === MEMORY_BANK_TOOL_NAME && componentContent.props?.summary) {
        this.memoryStore.add(componentContent.props.summary as string);
        return true;
      }
    }

    return false;
  }

  @action.bound
  private setUserRequestPending(pending: boolean) {
    this.userRequestPending = pending;

    if (pending) {
      BProgress.start();
    } else {
      BProgress.done();
      this.resetComponentTracking();
    }
  }

  @action.bound
  private resetComponentTracking() {
    this.lastUpdatedComponentId = null;
    this.lastPopulatedComponentId = null;
  }

  /**
   * Transition any tool components still stuck in active streaming states
   * (input-streaming, input-available, output-pending) to output-available.
   *
   * Some tools (e.g. native AI SDK tools like web_search) never emit the
   * full state machine transitions.  Cleaning up on `finish` ensures the
   * conversation model has correct terminal states for UI rendering and
   * session restore.
   */
  @action.bound
  private finalizeStaleTools(): void {
    const staleTools: ComponentContent[] = [];
    for (const msg of this.messages) {
      if (msg.type !== ContentType.Component) {
        continue;
      }
      const comp = msg as ComponentContent;
      const s = comp.streaming?.state;
      if (s === 'input-streaming' || s === 'input-available' || s === 'output-pending') {
        staleTools.push(comp);
      }
    }

    if (staleTools.length === 0) {
      return;
    }

    // Push synthetic output-available updates through the conversation
    // so both the conversation model and this.messages stay in sync.
    for (const comp of staleTools) {
      this.conversation.process({
        type: ContentType.Component,
        messageId: comp.messageId,
        componentName: comp.componentName,
        props: {},
        streaming: {
          ...comp.streaming!,
          state: 'output-available',
        },
      } as AgentMessagePayload);
    }
  }

  private resolvePendingRequest(): void {
    if (this.currentRequest) {
      this.currentRequest.completion.resolve();
      this.currentRequest = null;
    }
  }

  private rejectPendingRequest(error: Error): void {
    if (this.currentRequest) {
      this.currentRequest.completion.reject(error);
      this.currentRequest = null;
    }
  }

  private createCompletionPromise(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.currentRequest = {
        responseId: null,
        status: 'starting',
        completion: { resolve, reject },
      };
    });
  }

  private createMessagePayload(props: SendMessagePropsT): UserMessagePayloadT {
    if (props.audio) {
      return {
        id: crypto.randomUUID(),
        type: 'audio',
        content: { data: props.audio },
      };
    }
    return {
      id: crypto.randomUUID(),
      type: 'TXT',
      content: props.instruction || '',
    };
  }

  private extractMessageContent(messagePayload: UserMessagePayloadT): string {
    if (messagePayload.type === 'audio') {
      return (messagePayload.content.text as string) || '';
    }
    return typeof messagePayload.content === 'string'
      ? messagePayload.content
      : JSON.stringify(messagePayload.content);
  }

  private createRequestMetadata(
    props: SendMessagePropsT,
    messagePayload: UserMessagePayloadT,
  ): Record<string, unknown> | undefined {
    const baseMetadata = props.metadata ? { ...props.metadata } : {};
    if (messagePayload.type === 'audio') {
      return {
        ...baseMetadata,
        requestType: 'voice',
      };
    }
    return Object.keys(baseMetadata).length > 0 ? baseMetadata : undefined;
  }

  @action.bound
  private async transcribeAudioIfNeeded(messagePayload: UserMessagePayloadT) {
    if (messagePayload.type !== 'audio') {
      return;
    }

    try {
      const result = await trpc.platform.transcribe.mutate({
        data: messagePayload.content.data as string,
      });
      messagePayload.content.text = result.text;
    } catch {
      // Audio transcription failed silently
    }
  }
}
