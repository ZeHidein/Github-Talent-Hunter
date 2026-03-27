import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai';
import { createAnthropic, type AnthropicProvider } from '@ai-sdk/anthropic';
import { createAmazonBedrock, type AmazonBedrockProvider } from '@ai-sdk/amazon-bedrock';
import { createXai, type XaiProvider } from '@ai-sdk/xai';
import { createVertex, type GoogleVertexProvider } from '@ai-sdk/google-vertex';
import { createOpenRouter, type OpenRouterProvider } from '@openrouter/ai-sdk-provider';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ModelProvider } from './interfaces';

export interface ModelProviderConfig {
  /** Gateway base URL (e.g., http://localhost:3000/gateway). When omitted, providers use their default endpoints with API keys from environment variables. */
  baseUrl?: string;
  /** Access key for gateway authentication. Required when baseUrl is set. */
  accessKey?: string;
}

type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'amazon-bedrock'
  | 'xai'
  | 'google-vertex'
  | 'openrouter';

/**
 * Detects the provider type based on model name.
 */
export function detectProvider(modelName: string): ProviderType {
  // Bedrock model string format: region.vendor.model (e.g., global.anthropic.claude-sonnet-4-6)
  if (modelName.startsWith('global.anthropic.')) {
    return 'amazon-bedrock';
  }

  if (modelName.startsWith('claude')) {
    return 'anthropic';
  }

  if (modelName.startsWith('grok')) {
    return 'xai';
  }

  if (modelName.startsWith('gemini')) {
    return 'google-vertex';
  }

  if (modelName.startsWith('gpt') || modelName.startsWith('o1') || modelName.startsWith('o3')) {
    return 'openai';
  }

  if (modelName.includes('openrouter')) {
    return 'openrouter';
  }
  return 'openai';
}

const BEDROCK_BETA_HEADERS = {
  'anthropic-beta': 'interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14',
};

/**
 * Service that provides AI SDK language models.
 *
 * Operates in two modes:
 * - **Gateway mode** (baseUrl provided): Routes requests through the platform gateway
 *   which handles provider authentication, rate limiting, and billing.
 * - **Direct mode** (no baseUrl): Connects to provider APIs directly using
 *   API keys from environment variables (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)
 */
export class ModelProviderService implements ModelProvider {
  private config: ModelProviderConfig;
  private openaiProvider: OpenAIProvider | null = null;
  private anthropicProvider: AnthropicProvider | null = null;
  private bedrockProvider: AmazonBedrockProvider | null = null;
  private xaiProvider: XaiProvider | null = null;
  private vertexProvider: GoogleVertexProvider | null = null;
  private openrouterProvider: OpenRouterProvider | null = null;

  constructor(config: ModelProviderConfig = {}) {
    this.config = config;
  }

  private get gatewayHeaders(): Record<string, string> {
    return this.config.accessKey ? { 'X-Access-Key': this.config.accessKey } : {};
  }

  getOpenAIProvider(): OpenAIProvider {
    if (!this.openaiProvider) {
      this.openaiProvider = this.config.baseUrl
        ? createOpenAI({
            baseURL: `${this.config.baseUrl}/openai/v1`,
            apiKey: 'gateway',
            headers: this.gatewayHeaders,
          })
        : createOpenAI({});
    }
    return this.openaiProvider;
  }

  getAnthropicProvider(): AnthropicProvider {
    if (!this.anthropicProvider) {
      this.anthropicProvider = this.config.baseUrl
        ? createAnthropic({
            baseURL: `${this.config.baseUrl}/anthropic/v1`,
            apiKey: 'gateway',
            headers: this.gatewayHeaders,
          })
        : createAnthropic({});
    }
    return this.anthropicProvider;
  }

  getBedrockProvider(): AmazonBedrockProvider {
    if (!this.bedrockProvider) {
      this.bedrockProvider = this.config.baseUrl
        ? createAmazonBedrock({
            baseURL: `${this.config.baseUrl}/amazon-bedrock`,
            region: 'us-east-1',
            apiKey: 'gateway',
            headers: { ...this.gatewayHeaders, ...BEDROCK_BETA_HEADERS },
          })
        : createAmazonBedrock({
            headers: BEDROCK_BETA_HEADERS,
          });
    }
    return this.bedrockProvider;
  }

  getXaiProvider(): XaiProvider {
    if (!this.xaiProvider) {
      this.xaiProvider = this.config.baseUrl
        ? createXai({
            baseURL: `${this.config.baseUrl}/xai/v1`,
            apiKey: 'gateway',
            headers: this.gatewayHeaders,
          })
        : createXai({});
    }
    return this.xaiProvider;
  }

  getVertexProvider(): GoogleVertexProvider {
    if (!this.vertexProvider) {
      this.vertexProvider = this.config.baseUrl
        ? createVertex({
            baseURL: `${this.config.baseUrl}/google-vertex/v1/publishers/google`,
            apiKey: 'gateway',
            headers: this.gatewayHeaders,
          })
        : createVertex({});
    }
    return this.vertexProvider;
  }

  getOpenRouterProvider(): OpenRouterProvider {
    if (!this.openrouterProvider) {
      this.openrouterProvider = this.config.baseUrl
        ? createOpenRouter({
            baseURL: `${this.config.baseUrl}/openrouter/v1`,
            apiKey: 'gateway',
            headers: this.gatewayHeaders,
          })
        : createOpenRouter({});
    }
    return this.openrouterProvider;
  }

  /**
   * Gets a language model instance by name.
   * Automatically detects the provider based on model name prefix.
   */
  async getModel(modelName: string): Promise<LanguageModelV3> {
    const provider = detectProvider(modelName);

    switch (provider) {
      case 'amazon-bedrock': {
        return this.getBedrockProvider()(modelName);
      }

      case 'anthropic': {
        return this.getAnthropicProvider()(modelName);
      }

      case 'xai': {
        return this.getXaiProvider().responses(modelName);
      }

      case 'google-vertex': {
        return this.getVertexProvider()(modelName);
      }

      case 'openrouter': {
        // Model name format: "openrouter:vendor/model" — strip prefix for provider
        const openrouterModelName = modelName.replace(/^openrouter:/, '');
        return this.getOpenRouterProvider()(openrouterModelName);
      }

      case 'openai':
      default: {
        return this.getOpenAIProvider()(modelName);
      }
    }
  }

  /**
   * Updates the model provider configuration.
   */
  updateConfig(config: Partial<ModelProviderConfig>): void {
    this.config = { ...this.config, ...config };
    // Invalidate cached providers since config changed
    this.openaiProvider = null;
    this.anthropicProvider = null;
    this.bedrockProvider = null;
    this.xaiProvider = null;
    this.vertexProvider = null;
    this.openrouterProvider = null;
  }

  /**
   * Gets the current configuration (without exposing sensitive keys).
   */
  getConfig(): Omit<ModelProviderConfig, 'accessKey'> {
    return {
      baseUrl: this.config.baseUrl,
    };
  }
}
