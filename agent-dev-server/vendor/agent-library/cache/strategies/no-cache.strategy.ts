import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { AbstractCacheStrategy } from './abstract-cache.strategy.ts';

export class NoCacheStrategy extends AbstractCacheStrategy {
  canHandle(_modelId?: string, _aiSdkProvider?: string): boolean {
    return true;
  }

  applyCaching(prompt: LanguageModelV3Prompt): LanguageModelV3Prompt {
    return prompt;
  }
}
