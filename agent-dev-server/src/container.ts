import Settings from './settings';
import { MessagingService } from './bl/messaging/messaging.service';
import OpenAIAudioService from './services/openai-audio';
import type { ModelProvider } from './bl/agent/interfaces';
import { ModelProviderService } from './bl/agent/model-provider.service';
import { InstructionService } from './services/instruction.service';
import { AgentStorageFactoryService } from './services/agent-storage-factory.service';
import {
  AgentFactory,
  ToolLoopAgentRunner,
  DefaultPresenter,
  defaultPolicies,
  setLangfuseClient,
  StateConnection,
  AgentStateStore,
  RpcStateBackend,
  EventProcessor,
  TriggerDispatcher,
  TriggerRouter,
  InboxReconciler,
} from './bl/agent/agent-library';
import type { TriggerEvent, TriggerHandler } from './bl/agent/agent-library';
import LangfuseService from './services/langfuse';
import { RpcPeer, WebSocketAdapter } from '../vendor/agentplace-transport/node';
import { MCPServerRegistry } from './bl/tools/mcp-server.registry';
import { getConfigId } from './util/config';

export class DependencyContainer {
  static INSTANCE: DependencyContainer;

  public settings: Settings;

  private dependencies: {
    audioService: OpenAIAudioService;
    modelProvider: ModelProvider;
    agentFactory: AgentFactory;
    agentStorageFactoryService: AgentStorageFactoryService;
    stateConnection: StateConnection | null;
    agentStateStore: AgentStateStore | null;
    triggerRouter: TriggerRouter;
    eventProcessor: EventProcessor | null;
    mcpServerRegistry: MCPServerRegistry;
  };

  static getInstance(): DependencyContainer {
    if (!DependencyContainer.INSTANCE) {
      DependencyContainer.INSTANCE = new DependencyContainer();
    }
    return DependencyContainer.INSTANCE;
  }

  async setup(): Promise<void> {
    this.settings = new Settings();
    await this.settings.load();

    const modelBaseUrl = this.settings.getSecret('MODEL_BASE_URL');
    const modelAccessKey = this.settings.getSecret('MODEL_ACCESS_KEY');

    if (!modelBaseUrl) {
      throw new Error(
        'MODEL_BASE_URL environment variable is required but not set. Please configure it in the Settings → Environment Variables panel.',
      );
    }

    if (!modelAccessKey) {
      throw new Error(
        'MODEL_ACCESS_KEY environment variable is required but not set. Please configure it in the Settings → Environment Variables panel.',
      );
    }

    this.configureTracing(modelBaseUrl, modelAccessKey);

    // Audio service uses OpenAI via the gateway
    // Gateway injects the real API key, so we use a placeholder
    const gatewayBaseUrl = `${modelBaseUrl}/api/gateway`;
    const audioService = new OpenAIAudioService({
      connectionParams: {
        baseURL: `${gatewayBaseUrl}/openai/v1`,
        apiKey: 'gateway', // Placeholder - gateway injects real key
        defaultHeaders: {
          'X-Access-Key': modelAccessKey,
        },
      },
      enableAudioPreview: this.settings.getBooleanSecret('SHOULD_USE_AUDIO_PREVIEW_FOR_STT'),
      enableProcessing: this.settings.getBooleanSecret('SHOULD_PROCESS_AUDIO'),
    });

    const modelProvider = this.createModelProvider();

    const agentFactory = new AgentFactory({
      runner: new ToolLoopAgentRunner(),
      presenter: new DefaultPresenter(),
      policies: defaultPolicies,
    });

    const agentStorageFactoryService = new AgentStorageFactoryService({
      apiBaseUrl: modelBaseUrl,
      modelAccessToken: modelAccessKey,
    });

    const stateConnection = this.createStateConnection();
    const agentStateStore = this.createAgentStateStore(stateConnection);
    const triggerRouter = new TriggerRouter();
    const eventProcessor = this.createEventProcessor(agentStateStore, triggerRouter);
    const mcpServerRegistry = new MCPServerRegistry();

    this.dependencies = {
      modelProvider,
      audioService,
      agentFactory,
      agentStorageFactoryService,
      mcpServerRegistry,
      stateConnection,
      agentStateStore,
      triggerRouter,
      eventProcessor,
    };

    if (agentStateStore) {
      agentStateStore
        .connect()
        .then(() => {
          console.log('[Container] AgentStateStore connected — starting event processing');
          // Start event processor and reconcile inbox after connection is established
          if (eventProcessor) {
            eventProcessor.start();
            const reconciler = new InboxReconciler({
              store: agentStateStore,
              processor: eventProcessor,
            });
            reconciler.reconcile().catch((err) => {
              console.error('[Container] InboxReconciler failed:', err);
            });
          }
        })
        .catch((err) => {
          console.error('[Container] Failed to connect AgentStateStore:', err);
        });
    }

    console.log('[Container] Setup complete.');
  }

  createMessagingService() {
    return new MessagingService({
      audioService: this.dependencies.audioService,
      modelProvider: this.dependencies.modelProvider,
      instructionService: this.createInstructionService(),
      agentFactory: this.dependencies.agentFactory,
      storageFactory: this.dependencies.agentStorageFactoryService,
      mcpRegistry: this.dependencies.mcpServerRegistry,
    });
  }

  private createModelProvider(): ModelProvider {
    const gatewayBaseUrl = `${this.settings.getSecret('MODEL_BASE_URL')}/api/gateway`;
    return new ModelProviderService({
      baseUrl: gatewayBaseUrl,
      accessKey: this.settings.getSecret('MODEL_ACCESS_KEY'),
    });
  }

  createInstructionService(): InstructionService {
    return new InstructionService();
  }

  getAgentStorageFactoryService(): AgentStorageFactoryService {
    return this.dependencies.agentStorageFactoryService;
  }

  getStateConnection(): StateConnection | null {
    return this.dependencies.stateConnection;
  }

  getAgentStateStore(): AgentStateStore | null {
    return this.dependencies.agentStateStore;
  }

  getEventProcessor(): EventProcessor | null {
    return this.dependencies.eventProcessor;
  }

  /**
   * Register a typed trigger handler for external events (Composio triggers).
   *
   * Three modes:
   * 1. Code-only (no LLM) — return nothing from handler
   * 2. LLM-only — don't register a handler, the event goes to the LLM automatically
   * 3. Code + LLM — return { passToLlm: true, data? } to run code first, then forward to LLM
   *
   * @example
   * // Code-only: store data, no LLM tokens burned
   * container.registerTrigger('github_star_created', async (event, ctx) => {
   *   await ctx.store.set(`/data/stars/${event.eventId}`, event.payload);
   * });
   *
   * // Code + LLM: pre-process, then let LLM reason over it
   * container.registerTrigger('github_issue_created', async (event, ctx) => {
   *   await ctx.store.set(`/data/issues/${event.payload.issue.number}`, event.payload);
   *   return { passToLlm: true, data: { summary: `Issue #${event.payload.issue.number}` } };
   * });
   */
  registerTrigger(triggerName: string, handler: TriggerHandler): void {
    this.dependencies.triggerRouter.register(triggerName, handler);
  }

  private createEventProcessor(
    agentStateStore: AgentStateStore | null,
    triggerRouter: TriggerRouter,
  ): EventProcessor | null {
    if (!agentStateStore) {
      console.warn('[Container] EventProcessor not initialized: no AgentStateStore');
      return null;
    }

    const triggerDispatcher = new TriggerDispatcher({
      router: triggerRouter,
      store: agentStateStore,
      onUnhandled: (event: TriggerEvent, handlerData?: Record<string, unknown>) => {
        // LLM fallback (or passToLlm from handler): format trigger as text message and send via MessagingService
        this.#handleUnhandledTrigger(event, handlerData);
      },
    });

    const processor = new EventProcessor({
      store: agentStateStore,
      triggerDispatcher,
    });

    console.log('[Container] EventProcessor initialized');
    return processor;
  }

  async #handleUnhandledTrigger(
    event: TriggerEvent,
    handlerData?: Record<string, unknown>,
  ): Promise<void> {
    console.log('[Container] Handling trigger — starting agent run', {
      eventId: event.eventId,
      triggerName: event.triggerName,
      provider: event.provider,
      triggerId: event.triggerId,
      hasHandlerData: !!handlerData,
    });
    // Format trigger as text for LLM processing
    const triggerData: Record<string, unknown> = {
      trigger_id: event.triggerId,
      trigger_name: event.triggerName,
      provider: event.provider,
      connected_account_id: event.connectedAccountId,
      timestamp: event.timestamp,
      data: event.payload,
    };
    if (handlerData) {
      triggerData.handler_data = handlerData;
    }
    const message = `[composio-trigger]\n${JSON.stringify(triggerData, null, 2)}`;

    try {
      const messagingService = this.createMessagingService();
      const sessionId = `trigger-${event.triggerId || event.eventId}-${Date.now()}`;
      const instruction = this.createInstructionService().getInstruction() || '';

      const result = await messagingService.sendMessage({
        configId: getConfigId(this),
        message: { type: 'TXT', content: message },
        instruction,
        conversationHistory: [],
        sessionKey: sessionId,
      });

      // Consume the stream so the agent run completes
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of result.stream) {
        // drain
      }
      console.log('[Container] Agent run completed for trigger', {
        eventId: event.eventId,
        sessionId,
      });
    } catch (err) {
      console.error('[Container] LLM fallback for trigger failed:', err);
    }
  }

  private createAgentStateStore(stateConnection: StateConnection | null): AgentStateStore | null {
    if (!stateConnection) {
      console.warn('[Container] AgentStateStore not initialized: no StateConnection');
      return null;
    }

    const backend = new RpcStateBackend(stateConnection.transport);
    const store = new AgentStateStore(backend);
    console.log('[Container] AgentStateStore initialized');
    return store;
  }

  private createStateConnection(): StateConnection | null {
    const platformUrl = this.settings.getSecret('MODEL_BASE_URL');
    const agentToken = this.settings.getSecret('MODEL_ACCESS_KEY');
    if (!platformUrl || !agentToken) {
      console.warn(
        '[Container] StateConnection not initialized: missing MODEL_BASE_URL or MODEL_ACCESS_KEY',
      );
      return null;
    }

    const wsBase = platformUrl.replace(/\/$/, '').replace(/^http/, 'ws');
    const wsUrl = `${wsBase}/api/agents/state/ws?token=${encodeURIComponent(agentToken)}`;

    const adapter = new WebSocketAdapter({ url: wsUrl, reconnectDelay: 2000 });
    const rpcPeer = new RpcPeer(adapter);

    console.log('[Container] Initializing StateConnection');
    return new StateConnection({ transport: rpcPeer, adapter });
  }

  getMcpServerRegistry(): MCPServerRegistry {
    return this.dependencies.mcpServerRegistry;
  }

  private configureTracing(modelBaseUrl: string, modelAccessKey: string): void {
    const tracesBaseUrl = `${modelBaseUrl}/traces`;
    const langfuseService = new LangfuseService({
      apiKey: modelAccessKey,
      appName: this.settings.getAppName(),
      baseUrl: tracesBaseUrl,
    });

    setLangfuseClient(langfuseService.getClient());
    console.log(`[Tracing] Langfuse orchestrator configured via ${tracesBaseUrl}`);
  }
}
