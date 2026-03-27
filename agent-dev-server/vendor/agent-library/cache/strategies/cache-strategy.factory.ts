import { getAgentLogger } from '../../types/logger.ts';
import type { CacheStrategy } from './cache-strategy.interface.ts';
import { ClaudeCacheStrategy } from './anthropic/claude-cache.strategy.ts';
import { OpenRouterClaudeCacheStrategy } from './anthropic/openrouter-claude-cache.strategy.ts';
import { BedrockCacheStrategy } from './anthropic/bedrock-cache.strategy.ts';
import { NoCacheStrategy } from './no-cache.strategy.ts';

export type CacheStrategyFactoryConfig = {
  /** Custom strategies to use instead of defaults */
  strategies?: CacheStrategy[];
  /** Whether to include default strategies (default: true) */
  includeDefaults?: boolean;
};

/**
 * Factory for selecting the appropriate cache strategy based on model and provider.
 *
 * By default, includes strategies for:
 * - Anthropic Claude (direct API)
 * - Bedrock Claude
 * - OpenRouter Claude
 * - No-cache fallback
 *
 * @example
 * // Use default strategies
 * const factory = new CacheStrategyFactory();
 *
 * @example
 * // Use custom strategies only
 * const factory = new CacheStrategyFactory({
 *   strategies: [new MyCustomStrategy()],
 *   includeDefaults: false,
 * });
 *
 * @example
 * // Add custom strategy before defaults
 * const factory = new CacheStrategyFactory({
 *   strategies: [new MyCustomStrategy()],
 * });
 */
export class CacheStrategyFactory {
  private strategies: CacheStrategy[];

  constructor(config: CacheStrategyFactoryConfig = {}) {
    const { strategies = [], includeDefaults = true } = config;

    if (includeDefaults) {
      this.strategies = [
        ...strategies,
        new ClaudeCacheStrategy(),
        new OpenRouterClaudeCacheStrategy(),
        new BedrockCacheStrategy(),
        new NoCacheStrategy(),
      ];
    } else {
      this.strategies = strategies.length > 0 ? strategies : [new NoCacheStrategy()];
    }
  }

  getStrategy(modelId: string | undefined, provider: string | undefined): CacheStrategy {
    const logger = getAgentLogger();
    const strategy = this.strategies.find((s) => s.canHandle(modelId, provider));
    if (!strategy) {
      logger.warn(`No cache strategy for model=${modelId} provider=${provider ?? 'unknown'}`);
      return new NoCacheStrategy();
    }
    logger.debug(
      `Using ${strategy.getName()} for model=${modelId} provider=${provider ?? 'unknown'}`,
    );
    return strategy;
  }

  registerStrategy(strategy: CacheStrategy): void {
    this.strategies.unshift(strategy);
  }
}
