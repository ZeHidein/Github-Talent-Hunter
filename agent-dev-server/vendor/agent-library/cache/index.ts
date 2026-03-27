// Cache Strategy Interface
export type { CacheStrategy } from './strategies/cache-strategy.interface.ts';

// Base classes
export { AbstractCacheStrategy } from './strategies/abstract-cache.strategy.ts';
export { NoCacheStrategy } from './strategies/no-cache.strategy.ts';

// Anthropic/Claude strategies
export {
  ClaudeCacheStrategy,
  type ClaudeCacheStrategyConfig,
} from './strategies/anthropic/claude-cache.strategy.ts';
export {
  BedrockCacheStrategy,
  type BedrockCacheStrategyConfig,
} from './strategies/anthropic/bedrock-cache.strategy.ts';
export { OpenRouterClaudeCacheStrategy } from './strategies/anthropic/openrouter-claude-cache.strategy.ts';

// Factory
export {
  CacheStrategyFactory,
  type CacheStrategyFactoryConfig,
} from './strategies/cache-strategy.factory.ts';

// Middleware
export {
  CacheStrategyMiddleware,
  type CacheStrategyMiddlewareConfig,
} from './middlewares/cache-strategy.middleware.ts';

// Cache hints (for custom truncation integrations)
export {
  type CacheHintMetadata,
  setCacheHint,
  getCacheHint,
  isMessageStable,
  removeCacheHint,
  removeCacheHintsFromPrompt,
} from './metadata/cache-hints.ts';
