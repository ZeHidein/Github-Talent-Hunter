/**
 * Server-specific interfaces
 *
 * Re-exports IAgentState from agent-library for compatibility.
 * Server-specific functionality is handled via the app context in AgentState.
 */
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { OpenAIProvider } from '@ai-sdk/openai';
import type { AnthropicProvider } from '@ai-sdk/anthropic';
import type { AmazonBedrockProvider } from '@ai-sdk/amazon-bedrock';
import type { XaiProvider } from '@ai-sdk/xai';
import type { GoogleVertexProvider } from '@ai-sdk/google-vertex';
import type { IAgentState, IToolRegistry } from './agent-library';

/**
 * ModelProvider interface for AI SDK language models.
 */
export type ModelProvider = {
  getModel: (modelName: string) => Promise<LanguageModelV3>;
  /** Get the OpenAI provider instance for provider-native tools */
  getOpenAIProvider?: () => OpenAIProvider;
  /** Get the Anthropic provider instance for provider-native tools */
  getAnthropicProvider?: () => AnthropicProvider;
  /** Get the Amazon Bedrock provider instance for provider-native tools */
  getBedrockProvider?: () => AmazonBedrockProvider;
  /** Get the xAI provider instance for provider-native tools */
  getXaiProvider?: () => XaiProvider;
  /** Get the Google Vertex provider instance for provider-native tools */
  getVertexProvider?: () => GoogleVertexProvider;
};

// Re-export IAgentState from agent-library
export type { IAgentState, IToolRegistry };
