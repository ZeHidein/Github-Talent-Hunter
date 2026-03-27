import type { ModelMessage } from '@ai-sdk/provider-utils';
import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import type { LanguageModelUsage } from 'ai';
import { generateId } from '../types/id.ts';
import type { Attachment, IAgentState } from './interfaces.ts';

export type AgentKernelTurn = {
  lastUsage?: LanguageModelUsage;
  /**
   * The prior conversation in AI-SDK `ModelMessage` format.
   * This is **kernel-owned** and mandatory.
   */
  conversationHistory: ModelMessage[];
  /**
   * Kernel policy input: how many turns of history to include when building messages.
   */
  turnsLimit?: number;
  /**
   * Observability config that is owned by the agent/kernel (not product payload).
   * Example: trace display name.
   */
  trace?: {
    name?: string;
  };
};

/**
 * Snapshot of kernel state that can be persisted and restored.
 * Used with `toKernelSnapshot()` and `fromSnapshot()` for state restoration.
 */
export type KernelSnapshot = {
  conversationHistory: ModelMessage[];
  lastUsage?: LanguageModelUsage;
};

/**
 * Library-defined, minimal "input" surface required for a turn.
 * Everything else is an application-owned payload (`app`) that the core runtime treats as opaque.
 */
/**
 * Explicit split between what the kernel owns vs what the application owns.
 * This makes extension points and responsibilities obvious.
 */
export type AgentTurnRequest<TApp = unknown> = {
  kernel: AgentKernelTurn;
  app?: TApp;
};

type AgentStateParamsT<TApp> = {
  kernel: Required<Pick<AgentKernelTurn, 'conversationHistory'>> & {
    turnsLimit: number;
    trace?: AgentKernelTurn['trace'];
    lastUsage?: LanguageModelUsage;
  };
  app?: TApp;
  internal?: {
    lastUsage?: LanguageModelUsage;
  };
};

const DEFAULT_TURNS_LIMIT = 10;

export default class AgentState<TFrameworkState = unknown, TApp = unknown>
  implements IAgentState<TApp>
{
  private kernel: {
    conversationHistory: ModelMessage[];
    turnsLimit: number;
    trace?: { name?: string };
    traceId?: string;
  };

  private input: {
    instruction: string;
    responseId: string;
    attachments: Attachment[];
    modelId: string | null;
    provider: string | null;
  };

  private app?: TApp;

  private internal: {
    modelCallsCount: number;
    remindersCount: number;
    retriesCount: number;
    buildFixCount: number;
    error: Error | null;
    lastUsage?: LanguageModelUsage;
    runnerState: TFrameworkState | null;
    turnInputInjected: boolean;
    lastFinalPrompt?: LanguageModelV3Prompt;
    stepMessages: ModelMessage[];
    forceFullTruncation: boolean;
    truncationEscalationLevel: number;
  };

  private constructor({ kernel, app, internal }: AgentStateParamsT<TApp>) {
    this.kernel = {
      conversationHistory: kernel.conversationHistory ?? [],
      turnsLimit: kernel.turnsLimit ?? DEFAULT_TURNS_LIMIT,
      trace: kernel.trace,
      traceId: undefined,
    };

    this.input = {
      instruction: '',
      responseId: generateId(),
      attachments: [],
      modelId: null,
      provider: null,
    };
    this.app = app;

    this.internal = {
      modelCallsCount: 0,
      remindersCount: 0,
      retriesCount: 0,
      buildFixCount: 0,
      error: null,
      lastUsage: undefined,
      runnerState: null,
      turnInputInjected: false,
      lastFinalPrompt: undefined,
      stepMessages: [],
      forceFullTruncation: false,
      truncationEscalationLevel: 0,
      ...internal,
    };
  }

  /**
   * Library-style factory for creating an AgentState for a single agent turn.
   * The request is explicitly split into `kernel` vs `app` inputs.
   */
  static createTurn<TFrameworkState = unknown, TApp = unknown>(
    request: AgentTurnRequest<TApp>,
  ): AgentState<TFrameworkState, TApp> {
    if (!request?.kernel?.conversationHistory) {
      throw new Error('AgentState.createTurn() requires request.kernel.conversationHistory');
    }
    return new AgentState<TFrameworkState, TApp>({
      kernel: {
        conversationHistory: request.kernel.conversationHistory,
        turnsLimit: request.kernel.turnsLimit ?? DEFAULT_TURNS_LIMIT,
        trace: request.kernel.trace,
      },
      internal: {
        lastUsage: request.kernel.lastUsage,
      },
      app: request.app,
    });
  }

  /**
   * Convenience builder for request payloads.
   *
   * This keeps the "kernel vs app" split explicit, while avoiding call-sites manually constructing
   * the nested `{ kernel: ..., app: ... }` object.
   *
   * - `conversationHistory` is mandatory (kernel-owned)
   */
  static createRequest<TApp = unknown>(params: {
    conversationHistory: ModelMessage[];
    turnsLimit?: number;
    traceName?: string;
    lastUsage?: LanguageModelUsage;
    app?: TApp;
  }): AgentTurnRequest<TApp> {
    return {
      kernel: {
        lastUsage: params.lastUsage,
        conversationHistory: params.conversationHistory,
        turnsLimit: params.turnsLimit,
        trace: params.traceName ? { name: params.traceName } : undefined,
      },
      app: params.app,
    };
  }

  /**
   * Create a turn request from a snapshot (typically from `lastStateUpdate`).
   *
   * This simplifies state restoration by accepting a partial snapshot object
   * and extracting kernel fields automatically.
   *
   * @example
   * ```typescript
   * // Restore from lastStateUpdate
   * const state = AgentState.fromSnapshot(lastStateUpdate, {
   *   app: { userId: 'u_123', context: requestContext },
   * });
   *
   * // With history transformation
   * const cleanedHistory = cleanupHistory(lastStateUpdate?.conversationHistory || []);
   * const state = AgentState.fromSnapshot(
   *   { ...lastStateUpdate, conversationHistory: cleanedHistory },
   *   { app: { ... } }
   * );
   * ```
   */
  static fromSnapshot<TApp = unknown>(
    snapshot: Partial<KernelSnapshot> | null | undefined,
    options?: {
      app?: TApp;
      turnsLimit?: number;
    },
  ): AgentTurnRequest<TApp> {
    return {
      kernel: {
        conversationHistory: snapshot?.conversationHistory ?? [],
        lastUsage: snapshot?.lastUsage,
        turnsLimit: options?.turnsLimit,
      },
      app: options?.app,
    };
  }

  getRunnerState(): TFrameworkState | null {
    return this.internal.runnerState;
  }

  setRunnerState(state: TFrameworkState | null): void {
    this.internal.runnerState = state;
  }

  getAppContext(): TApp | null {
    return this.app ?? null;
  }

  setAppContext(ctx: TApp | null): void {
    this.app = ctx ?? undefined;
  }

  getApp<T = TApp>(): T | undefined {
    return this.app as unknown as T | undefined;
  }

  setApp<T = TApp>(payload: T | undefined): void {
    this.app = payload as unknown as TApp | undefined;
  }

  getTraceConfig(): { name?: string } | undefined {
    return this.kernel.trace;
  }

  setTraceConfig(trace: { name?: string } | undefined): void {
    this.kernel.trace = trace;
  }

  getTraceId(): string | undefined {
    return this.kernel.traceId;
  }

  setTraceId(traceId: string | undefined): void {
    this.kernel.traceId = traceId;
  }

  /**
   * Extract kernel state as a snapshot for persistence.
   *
   * Use this to capture the state that should be sent in `StateUpdate`
   * and restored via `fromSnapshot()` in the next turn.
   *
   * @example
   * ```typescript
   * // In presenter/checkpoint emission
   * const snapshot = state.toKernelSnapshot();
   * emit({ ...snapshot, ...appExtras });
   * ```
   */
  toKernelSnapshot(): KernelSnapshot {
    return {
      conversationHistory: this.getConversationHistory(),
      lastUsage: this.getLastUsage(),
    };
  }

  getUserQueryText(): string | undefined {
    return this.input.instruction;
  }

  setUserQueryText(instruction: string): void {
    this.input.instruction = instruction ?? '';
    this.internal.turnInputInjected = false;
  }

  setError(error: Error | null) {
    this.internal.error = error;
  }

  getError(): Error | null {
    return this.internal.error;
  }

  setLastUsage(usage: LanguageModelUsage | null | undefined): void {
    this.internal.lastUsage = usage ?? undefined;
  }

  getLastUsage(): LanguageModelUsage | undefined {
    return this.internal.lastUsage;
  }

  getBuildFixCount(): number {
    return this.internal.buildFixCount;
  }

  increaseBuildFixCount() {
    this.internal.buildFixCount += 1;
  }

  increaseModelCallsCount(byNumber: number = 1) {
    this.internal.modelCallsCount += byNumber;
  }

  getModelCallsCount() {
    return this.internal.modelCallsCount;
  }

  increaseRetriesCount() {
    this.internal.retriesCount += 1;
  }

  getRetriesCount() {
    return this.internal.retriesCount;
  }

  getRemindersCount() {
    return this.internal.remindersCount;
  }

  getModelId(): string | null {
    return this.input.modelId ?? null;
  }

  setModelId(modelId: string | null): void {
    this.input.modelId = modelId ?? null;
  }

  getProvider(): string | null {
    return this.input.provider ?? null;
  }

  setProvider(provider: string | null): void {
    this.input.provider = provider ?? null;
  }

  getResponseId(): string {
    return this.input.responseId;
  }

  setResponseId(responseId: string | undefined): void {
    this.input.responseId = responseId ?? generateId();
  }

  getAttachments(): Attachment[] {
    return this.input.attachments ?? [];
  }

  setAttachments(attachments: Attachment[] | undefined): void {
    this.input.attachments = attachments ?? [];
    this.internal.turnInputInjected = false;
  }

  hasTurnInputInjected(): boolean {
    return this.internal.turnInputInjected;
  }

  markTurnInputInjected(): void {
    this.internal.turnInputInjected = true;
  }

  /**
   * Capture the final prompt that will be sent to the model after all middleware transformations.
   * Useful for debugging and observability.
   */
  setLastFinalPrompt(prompt: LanguageModelV3Prompt | undefined): void {
    this.internal.lastFinalPrompt = prompt;
  }

  getLastFinalPrompt(): LanguageModelV3Prompt | undefined {
    return this.internal.lastFinalPrompt;
  }

  getForceFullTruncation(): boolean {
    return this.internal.forceFullTruncation;
  }

  setForceFullTruncation(force: boolean): void {
    this.internal.forceFullTruncation = force;
  }

  /** Truncation pressure escalation level (0 = normal, higher = more aggressive). */
  getTruncationEscalationLevel(): number {
    return this.internal.truncationEscalationLevel;
  }

  /** Increment the truncation escalation level and return the new value. */
  increaseTruncationEscalationLevel(): number {
    this.internal.truncationEscalationLevel += 1;
    return this.internal.truncationEscalationLevel;
  }

  resetTruncationEscalationLevel(): void {
    this.internal.truncationEscalationLevel = 0;
  }

  /**
   * Replace kernel history without clearing in-progress stepMessages.
   * Safe to call mid-turn (during tool loop).
   */
  replaceKernelHistory(history: ModelMessage[]): void {
    this.kernel.conversationHistory = [...history];
  }

  getConversationHistory(): ModelMessage[] {
    if (this.internal.stepMessages.length > 0) {
      return [...this.kernel.conversationHistory, ...this.internal.stepMessages];
    }
    return this.kernel.conversationHistory;
  }

  getKernelConversationHistory(): ModelMessage[] {
    return this.kernel.conversationHistory;
  }

  getStepMessages(): ModelMessage[] {
    return this.internal.stepMessages;
  }

  setStepMessages(stepMessages: ModelMessage[]): void {
    if (!Array.isArray(stepMessages) || stepMessages.length === 0) {
      return;
    }
    this.internal.stepMessages = stepMessages;
  }

  commitStepMessages(): void {
    if (this.internal.stepMessages.length === 0) {
      return;
    }
    this.kernel.conversationHistory = [
      ...this.kernel.conversationHistory,
      ...this.internal.stepMessages,
    ];
    this.internal.stepMessages = [];
  }

  setConversationHistory(history: ModelMessage[]): void {
    this.kernel.conversationHistory = [...history];
    this.internal.stepMessages = [];
  }

  hasConversationHistory(): boolean {
    return this.getConversationHistory().length > 0;
  }

  clearConversationHistory(): void {
    this.kernel.conversationHistory = [];
    this.internal.stepMessages = [];
  }

  getTurnsLimit(): number {
    return this.kernel.turnsLimit;
  }

  /**
   * Finds and returns the system message content from conversation history if it exists
   * @returns The system message content or undefined if not found
   */
  findSystemMessageFromHistory(): string | undefined {
    if (!this.hasConversationHistory()) {
      return undefined;
    }

    const systemMessage = this.getConversationHistory().find(
      (item: any) => item.role === 'system',
    ) as any;

    return systemMessage?.content;
  }
}
