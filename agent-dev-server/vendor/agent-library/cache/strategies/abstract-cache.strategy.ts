import type { LanguageModelV3Message, LanguageModelV3Prompt } from '@ai-sdk/provider';
import type { CacheStrategy } from './cache-strategy.interface.ts';
import { type AgentLogger, getAgentLogger } from '../../types/logger.ts';

export abstract class AbstractCacheStrategy implements CacheStrategy {
  protected supportedProviders: string[] = [];
  protected supportedModels: string[] = [];

  protected getLogger(): AgentLogger {
    return getAgentLogger();
  }

  canHandle(modelId: string | undefined, aiSdkProvider: string | undefined): boolean {
    if (!aiSdkProvider || !modelId) {
      return false;
    }
    if (!this.supportedProviders.includes(aiSdkProvider)) {
      return false;
    }
    return this.supportedModels.includes(modelId);
  }

  getName(): string {
    return this.constructor.name;
  }

  abstract applyCaching(prompt: LanguageModelV3Prompt): LanguageModelV3Prompt;

  protected findSystemMessage(messages: LanguageModelV3Message[]): number {
    for (let i = 0; i < Math.min(3, messages.length); i++) {
      if (messages[i].role === 'system') {
        return i;
      }
    }
    return -1;
  }

  protected findLastAssistantMessage(messages: LanguageModelV3Message[]): number {
    for (let i = messages.length - 2; i >= 0; i--) {
      const item = messages[i];
      if (item.role === 'assistant') {
        return i;
      }
    }
    return -1;
  }
}
