import type { LanguageModelV3Message } from '@ai-sdk/provider';
import { ClaudeCacheStrategy } from './claude-cache.strategy.ts';

export class OpenRouterClaudeCacheStrategy extends ClaudeCacheStrategy {
  protected supportedProviders = ['openrouter'];

  canHandle(modelId: string | undefined, aiSdkProvider: string | undefined): boolean {
    if (!aiSdkProvider || !modelId) {
      return false;
    }
    if (aiSdkProvider !== 'openrouter') {
      return false;
    }

    const lower = modelId.toLowerCase();
    return lower.includes('claude') || lower.includes('anthropic');
  }

  protected applyCacheControl(message: LanguageModelV3Message): void {
    (message as any).providerOptions = {
      ...((message as any).providerOptions || {}),
      openrouter: { cacheControl: { type: 'ephemeral', ttl: '5m' } },
    };
  }
}
