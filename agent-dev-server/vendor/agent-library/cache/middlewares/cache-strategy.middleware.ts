import type { LanguageModelV3CallOptions } from '@ai-sdk/provider';
import type { LanguageModelMiddleware } from 'ai';
import type {
  KernelModelMiddleware,
  KernelModelMiddlewareContext,
} from '../../kernel/middlewares/types.ts';
import type { CacheStrategyFactory } from '../strategies/cache-strategy.factory.ts';
import { removeCacheHintsFromPrompt } from '../metadata/cache-hints.ts';

export type CacheStrategyMiddlewareConfig = {
  /** Whether to log cache token statistics (default: false) */
  logCacheStats?: boolean;
};

/**
 * Middleware that applies prompt caching strategies based on the model/provider.
 *
 * This middleware:
 * 1. Selects the appropriate cache strategy for the current model
 * 2. Applies cache control markers to the prompt before LLM calls
 * 3. Tracks usage statistics including cached tokens
 *
 * @example
 * const factory = new CacheStrategyFactory();
 * const middleware = new CacheStrategyMiddleware(factory);
 */
export class CacheStrategyMiddleware implements KernelModelMiddleware {
  private factory: CacheStrategyFactory;
  private logCacheStats: boolean;

  constructor(factory: CacheStrategyFactory, config: CacheStrategyMiddlewareConfig = {}) {
    this.factory = factory;
    this.logCacheStats = config.logCacheStats ?? process.env.LOG_CACHE_TOKENS === 'true';
  }

  create(ctx: KernelModelMiddlewareContext): LanguageModelMiddleware {
    const strategy = this.factory.getStrategy(
      ctx.state.getModelId() ?? undefined,
      ctx.state.getProvider() ?? undefined,
    );

    return {
      specificationVersion: 'v3',
      transformParams: async ({ params }) => {
        const opts = params as LanguageModelV3CallOptions;
        // Apply caching strategy (reads cache hints if available)
        const cachedPrompt = strategy.applyCaching(opts.prompt);
        // Remove cache hints before sending to LLM - they're internal metadata
        removeCacheHintsFromPrompt(cachedPrompt);
        return { ...opts, prompt: cachedPrompt };
      },
    };
  }
}
