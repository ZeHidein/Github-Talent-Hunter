import type { LanguageModelV3Message } from '@ai-sdk/provider';
import { ClaudeCacheStrategy, type ClaudeCacheStrategyConfig } from './claude-cache.strategy.ts';

export type BedrockCacheStrategyConfig = ClaudeCacheStrategyConfig;

export class BedrockCacheStrategy extends ClaudeCacheStrategy {
  protected supportedProviders = ['amazon-bedrock'];

  constructor(config: BedrockCacheStrategyConfig = {}) {
    super(config);
  }

  canHandle(modelId: string | undefined, aiSdkProvider: string | undefined): boolean {
    if (!aiSdkProvider || !modelId) {
      return false;
    }
    if (aiSdkProvider !== 'amazon-bedrock') {
      return false;
    }
    // Check if it's a Claude model on Bedrock
    return modelId.toLowerCase().includes('claude') || modelId.toLowerCase().includes('anthropic');
  }

  getName(): string {
    return 'BedrockClaudeCacheStrategy';
  }

  protected applyCacheControl(message: LanguageModelV3Message): void {
    (message as any).providerOptions = {
      ...((message as any).providerOptions || {}),
      bedrock: { cachePoint: { type: 'default' } },
    };
  }
}
