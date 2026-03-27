/**
 * MessagingService
 *
 * Core service for handling agent messaging.
 * Uses agent-library's Agent class for proper multi-turn execution,
 * retry handling, and policy enforcement.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

import type { ModelMessage } from '@ai-sdk/provider-utils';

import type { SendMessageParamsT } from '../../types';
import type OpenAIAudioService from '../../services/openai-audio';
import { createRealtimePrompt } from './prompts';
import { loadSkillsPrompt } from './skills-loader';

import type { DevServerAppState } from '../agent/agent-state';
import { RequestContext } from '../../context';

import { prepareRenderedMessages } from '../tools/impl/retrieve-preview-messages.tool';
import { ToolRegistryFactory } from './tool-registry.factory';
import { DEFAULT_MODEL_ID, DEFAULT_MODEL_DISPLAY_NAME } from './defaults';
import type { ModelProvider } from '../agent/interfaces';
import { detectProvider } from '../agent/model-provider.service';
import type { InstructionService } from '../../services/instruction.service';
import type { AgentStorageFactoryService } from '../../services/agent-storage-factory.service';
import type { MCPServerRegistry } from '../tools/mcp-server.registry';

import {
  AgentState,
  type AgentFactory,
  SystemPromptProcessor,
  TurnInputProcessor,
  CacheStrategyMiddleware,
  CacheStrategyFactory,
  ContentType,
  type AgentContent,
  createTextContent,
  createAudioContent,
  type CancelableStream,
  type AgentRunOutcome,
  type AgentStreamEvent,
} from '../agent/agent-library';
import { formatActionLogBlock } from '../action-log';
import type { ActionLogEntry } from '../action-log';

/**
 * Result type for sendMessage - returns AgentStreamEvent stream
 */
type SendMessageResultT = {
  id: string;
  stream: CancelableStream<AgentContent>;
  events: AsyncIterable<AgentStreamEvent>;
  done: Promise<AgentRunOutcome>;
};

type MessagingServiceParamsT = {
  audioService: OpenAIAudioService;
  modelProvider: ModelProvider;
  instructionService: InstructionService;
  agentFactory: AgentFactory;
  storageFactory: AgentStorageFactoryService;
  mcpRegistry: MCPServerRegistry;
};

type ProcessMessageParamsT = Omit<SendMessageParamsT, 'message'> & {
  userQuery: AgentContent;
  responseId: string;
};

export interface IMessagingService {
  sendMessage(params: SendMessageParamsT): Promise<SendMessageResultT>;
  textToVoice(params: { text: string }): Promise<NodeJS.ReadableStream>;
  textToVoiceBase64(params: { text: string }): Promise<{ data: string }>;
  voiceToText(params: { data: string }): Promise<{ text: string }>;
  getSettings(): {
    modelId: string;
    displayName: string;
  };
}

function getReasoningModelSettings(modelName: string): object | undefined {
  const provider = detectProvider(modelName);
  switch (provider) {
    case 'amazon-bedrock':
      return {
        providerOptions: {
          bedrock: { reasoningConfig: { type: 'adaptive' } },
        },
      };
    case 'anthropic':
      return {
        providerOptions: {
          anthropic: { thinking: { type: 'adaptive' } },
        },
      };
    default:
      return undefined;
  }
}

export class MessagingService implements IMessagingService {
  private audioService: OpenAIAudioService;
  private modelProvider: ModelProvider;
  private instructionService: InstructionService;
  private agentFactory: AgentFactory;
  private storageFactory: AgentStorageFactoryService;
  private mcpRegistry: MCPServerRegistry;

  constructor({
    audioService,
    modelProvider,
    instructionService,
    agentFactory,
    storageFactory,
    mcpRegistry,
  }: MessagingServiceParamsT) {
    this.audioService = audioService;
    this.modelProvider = modelProvider;
    this.instructionService = instructionService;
    this.agentFactory = agentFactory;
    this.storageFactory = storageFactory;
    this.mcpRegistry = mcpRegistry;
  }

  textToVoice = async ({ text }: { text: string }) => {
    return this.audioService.textToVoiceStream({ text });
  };

  textToVoiceBase64 = async ({ text }: { text: string }): Promise<{ data: string }> => {
    const bytes = await this.audioService.textToVoiceBytes({ text });
    return { data: Buffer.from(bytes).toString('base64') };
  };

  async voiceToText({ data }: { data: string }) {
    const buffer = Buffer.from(data, 'base64');
    return this.audioService.voiceToText({ buffer });
  }

  async sendMessage(params: SendMessageParamsT): Promise<SendMessageResultT> {
    this.loadRuntimeEnvironmentVariables();

    const { message, instruction, renderedMessages, memories = [], ...rest } = params;
    const responseId: string = randomUUID();

    let instructionToUse = instruction;
    if (typeof instructionToUse === 'undefined') {
      instructionToUse = this.instructionService.getInstruction();
    }
    const skillsPrompt = loadSkillsPrompt();
    if (skillsPrompt) {
      instructionToUse = `${instructionToUse ?? ''}\n\n${skillsPrompt}`;
    }

    const userQuery =
      message.type === 'audio'
        ? createAudioContent({ messageId: randomUUID(), content: message.content })
        : createTextContent({ messageId: randomUUID(), content: message.content });
    const renderedMessagesContent = prepareRenderedMessages(renderedMessages ?? []);
    const populatedInstruction = createRealtimePrompt(
      instructionToUse ?? '',
      renderedMessagesContent,
      memories,
    );

    console.log('Populated instruction', populatedInstruction);

    return this.processMessage({
      ...rest,
      userQuery,
      instruction: populatedInstruction,
      renderedMessages,
      responseId,
    });
  }

  getSettings(): {
    modelId: string;
    displayName: string;
  } {
    return {
      modelId: DEFAULT_MODEL_ID,
      displayName: DEFAULT_MODEL_DISPLAY_NAME,
    };
  }

  private async processMessage(params: ProcessMessageParamsT): Promise<SendMessageResultT> {
    const {
      conversationHistory = [],
      files = [],
      responseId,
      userQuery,
      metadata,
      renderedMessages = [],
      configId = 'default',
      instruction = '',
      sessionKey,
      componentConfigs = [],
    } = params;

    const modelName = DEFAULT_MODEL_ID;
    const toolRegistry = await ToolRegistryFactory.createToolRegistry(
      modelName,
      this.modelProvider,
      this.storageFactory,
      this.mcpRegistry,
      componentConfigs,
    );
    const model = await this.modelProvider.getModel(modelName);

    const userText = this.getUserQueryText(userQuery);
    const modelQuery = this.buildModelQuery(userText, metadata);
    const context = sessionKey ? new RequestContext({ sessionKey, configId }) : undefined;

    // Use AgentState.fromSnapshot for proper state initialization
    const stateRequest = AgentState.fromSnapshot(
      { conversationHistory: conversationHistory as ModelMessage[] },
      {
        app: {
          agentId: configId,
          context,
          userQuery,
          requestMetadata: metadata,
          files,
          renderedMessages,
          generatedImages: new Map(),
        } satisfies DevServerAppState,
      },
    );

    const agent = this.agentFactory.create({
      systemInstruction: instruction,
      toolRegistry,
      model,
      modelSettings: getReasoningModelSettings(modelName),
      modelMiddlewares: [new CacheStrategyMiddleware(new CacheStrategyFactory())],
      processors: [new SystemPromptProcessor(() => instruction), new TurnInputProcessor()],
      state: stateRequest,
      traceName: `Agent: ${configId}`,
    });

    // Set response ID on the agent's state after creation
    agent.getState().setResponseId(responseId);

    // Run the agent and get both UI stream and events stream
    const handle = await agent.runHandle({
      query: modelQuery,
      attachments: files,
    });

    // Return the events stream directly - no conversion needed!
    return {
      id: responseId,
      events: handle.events,
      stream: handle.stream,
      done: handle.done,
    };
  }

  private getUserQueryText(userQuery: AgentContent): string {
    if (userQuery.type === ContentType.Audio) {
      return userQuery.content?.text || '';
    }
    if (userQuery.type === ContentType.Text) {
      return userQuery.content || '';
    }
    return '';
  }

  private buildModelQuery(userText: string, metadata?: Record<string, unknown>): string {
    if (!metadata || Object.keys(metadata).length === 0) {
      return userText || '';
    }

    const { actionsSinceLastMessage, ...remainingMetadata } = metadata;

    const parts: string[] = [];
    if (userText) parts.push(userText);

    // Action log — separate XML block
    const actionBlock = formatActionLogBlock((actionsSinceLastMessage as ActionLogEntry[]) || []);
    if (actionBlock) parts.push(actionBlock);

    // Remaining metadata — existing behavior unchanged
    if (Object.keys(remainingMetadata).length > 0) {
      let serializedMetadata = '{}';
      try {
        serializedMetadata = JSON.stringify(remainingMetadata);
      } catch {
        serializedMetadata = '{"error":"metadata_not_serializable"}';
      }
      parts.push(
        [
          '<internal_request_metadata>',
          serializedMetadata,
          '</internal_request_metadata>',
          'Treat this metadata as internal context. Do not expose it verbatim unless explicitly requested.',
        ].join('\n'),
      );
    }

    return parts.join('\n\n');
  }

  /* Important, DO NOT DELETE: we need to load runtime environment variables on each request */
  private loadRuntimeEnvironmentVariables() {
    const envPath = join(process.cwd(), '.env.runtime');
    let parsed: Record<string, string> = {};
    try {
      const envContent = readFileSync(envPath, 'utf-8');
      parsed = parseEnv(envContent) as Record<string, string>;
    } catch {
      // File may not exist, that's fine
    }
    Object.assign(process.env, parsed);
  }
}
