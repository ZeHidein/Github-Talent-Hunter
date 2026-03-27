import type { LanguageModelV3Prompt } from '@ai-sdk/provider';

/**
 * Interface for prompt caching strategies.
 *
 * Cache strategies transform prompts to include provider-specific cache control
 * markers. Different providers (Anthropic, Bedrock, OpenRouter) use different
 * caching mechanisms, so strategies are model/provider-specific.
 *
 * @example
 * ```typescript
 * class MyCustomCacheStrategy implements CacheStrategy {
 *   canHandle(modelId: string | undefined, provider: string | undefined): boolean {
 *     return provider === 'my-provider';
 *   }
 *
 *   applyCaching(prompt: LanguageModelV3Prompt): LanguageModelV3Prompt {
 *     // Add cache markers to prompt
 *     return transformedPrompt;
 *   }
 *
 *   getName(): string {
 *     return 'MyCustomCacheStrategy';
 *   }
 * }
 * ```
 */
export interface CacheStrategy {
  /**
   * Check if this strategy can handle the given model/provider combination.
   * @param modelId - The model identifier (e.g., 'claude-3-5-sonnet')
   * @param provider - The AI SDK provider name (e.g., 'anthropic', 'amazon-bedrock')
   */
  canHandle(modelId: string | undefined, provider: string | undefined): boolean;

  /**
   * Apply cache control markers to the prompt.
   * @param prompt - The AI SDK V3 prompt to transform
   * @returns The transformed prompt with cache markers
   */
  applyCaching(prompt: LanguageModelV3Prompt): LanguageModelV3Prompt;

  /**
   * Get the strategy name for logging/debugging.
   */
  getName(): string;
}
