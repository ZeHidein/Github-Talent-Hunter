/**
 * NanoBanana Tool - Gemini 2.5 Flash Image Generation Tool
 *
 * This tool uses Google's Gemini 2.5 Flash model to generate images from text prompts.
 * Routes through OpenRouter for higher rate limits.
 */
import { z } from 'zod';
import { generateText } from 'ai';
import { promises as fs } from 'node:fs';
import {
  ToolModel,
  type ToolExecuteContext,
  type ToolExecuteResult,
} from '../../agent/agent-library';
import type { ModelProvider } from '../../agent/interfaces';
import type { PublicCdnUploadService } from '../../../services/public-cdn-upload.service';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NanoBananaSchema = z.object({
  prompt: z
    .string()
    .describe(
      'Detailed text prompt describing the image to generate. ' +
        'Be specific about style, composition, lighting, colors, and subject matter. ' +
        'Example: "A photorealistic sunset over mountains with vibrant orange and purple clouds, 8k quality"',
    ),
});

type NanoBananaInput = z.infer<typeof NanoBananaSchema>;

const TOOL_NAME = 'nanobanana';
const IMAGE_MODEL = 'openrouter:google/gemini-2.5-flash-image';

type NanoBananaParams = {
  modelProvider: ModelProvider;
  cdnUploadService: PublicCdnUploadService;
};

export default class NanoBananaToolModel extends ToolModel<NanoBananaInput> {
  private modelProvider: ModelProvider;
  private cdnUploadService: PublicCdnUploadService;

  constructor(params: NanoBananaParams) {
    super({
      toolType: 'function',
      name: TOOL_NAME,
      description:
        'Generate images from text prompts using Gemini 2.5 Flash (NanoBanana). ' +
        'Supports various aspect ratios (1:1, 16:9, 9:16, etc.). ' +
        'Use this tool when you need to create visual content from descriptions.',
      parametersSchema: NanoBananaSchema,
      isStreaming: false,
      isStrict: false,
    });
    this.modelProvider = params.modelProvider;
    this.cdnUploadService = params.cdnUploadService;
  }

  async execute(input: NanoBananaInput, ctx: ToolExecuteContext): Promise<ToolExecuteResult> {
    try {
      console.log('Generating image for prompt:', input.prompt);
      const imageResult = await this.generateImage(input.prompt);
      console.log('Image generation result:', imageResult);
      if (!imageResult) {
        return {
          output: 'No image generated in response',
        };
      }

      console.log('Uploading image to CDN');
      const extension = imageResult.mediaType.split('/')[1] || 'png';
      const filename = `nanobanana-${Date.now()}.${extension}`;
      const cdnUrl = await this.cdnUploadService.upload(
        imageResult.buffer,
        imageResult.mediaType,
        filename,
      );

      return {
        output: cdnUrl,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error(`[NanoBanana Tool] Error:`, errorMessage);
      throw new Error(`Error generating image: ${errorMessage}`);
    }
  }

  /**
   * Generates an image using Gemini 2.5 Flash via OpenRouter
   */
  private async generateImage(
    prompt: string,
  ): Promise<{ buffer: Buffer; mediaType: string } | null> {
    const model = await this.modelProvider.getModel(IMAGE_MODEL);

    const result = await generateText({
      model,
      prompt,
      providerOptions: {
        openai: { responseModalities: ['text', 'image'] },
      },
    });

    const content = result.steps[0]?.content;
    if (!content) {
      return null;
    }

    const output = content?.find((content) => content.type === 'file');
    if (!output?.file) {
      return null;
    }

    const base64 = output.file.base64;
    if (!base64) {
      return null;
    }

    const match = base64.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return {
        buffer: Buffer.from(match[2], 'base64'),
        mediaType: match[1],
      };
    }

    return {
      buffer: Buffer.from(base64, 'base64'),
      mediaType: output.file.mediaType,
    };
  }
}
