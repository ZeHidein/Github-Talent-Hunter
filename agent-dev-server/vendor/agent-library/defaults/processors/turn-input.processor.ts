import { FileContentEncoder, type FileEncoderConfig } from '../../files/file-content-encoder.ts';
import type { FileContentMask } from '../../files/interfaces.ts';
import { omitTextContentBySize } from '../../files/file-content-masks.ts';
import type { Attachment } from '../../core/interfaces.ts';
import type { ModelMessage } from '@ai-sdk/provider-utils';
import type { TurnProcessor, TurnProcessorState } from '../../kernel/processors/types.ts';

/**
 * Configuration for TurnInputProcessor
 */
export interface TurnInputProcessorConfig {
  /**
   * File encoder configuration - enable/disable specific file types.
   * @default All encoders enabled
   */
  fileEncoders?: FileEncoderConfig;

  /**
   * File content masks to apply before encoding.
   * @default [omitTextContentBySize(10MB)]
   */
  fileMasks?: FileContentMask[];

  /**
   * Disable file encoding entirely.
   * When true, attachments are ignored.
   * @default false
   */
  disableFileEncoding?: boolean;
}

/**
 * TurnInputProcessor
 *
 * Conceptually different from model middlewares:
 * - runs once per agent turn (not per model call/step)
 * - can intentionally COMMIT messages into canonical conversation history
 *
 * This is the right place for "current user instruction + attachments" injection.
 *
 * @example
 * ```typescript
 * // Default - all file encoders enabled
 * const processor = new TurnInputProcessor();
 *
 * // Only enable image and text encoding
 * const processor = new TurnInputProcessor({
 *   fileEncoders: { image: true, text: true, pdf: false, word: false, excel: false }
 * });
 *
 * // Disable file encoding entirely
 * const processor = new TurnInputProcessor({ disableFileEncoding: true });
 *
 * // Custom file size limit
 * const processor = new TurnInputProcessor({
 *   fileMasks: [omitTextContentBySize(1024 * 1024)] // 1MB limit
 * });
 * ```
 */
export class TurnInputProcessor implements TurnProcessor {
  private readonly fileContentEncoder: FileContentEncoder | null;
  private readonly fileContentMasks: FileContentMask[];

  constructor(config: TurnInputProcessorConfig = {}) {
    if (config.disableFileEncoding) {
      this.fileContentEncoder = null;
    } else {
      this.fileContentEncoder = new FileContentEncoder(config.fileEncoders);
    }
    this.fileContentMasks = config.fileMasks ?? [omitTextContentBySize(1024 * 1024 * 10)];
  }

  async buildUserTurnMessage(args: {
    instruction: string;
    attachments: Attachment[];
  }): Promise<ModelMessage> {
    const { instruction, attachments } = args;

    const userParts: Array<
      | { type: 'text'; text: string }
      | { type: 'file'; data: string; mediaType: string; filename?: string }
    > = [];

    if (instruction) {
      userParts.push({ type: 'text', text: instruction });
    }

    // Only process attachments if file encoding is enabled
    if (this.fileContentEncoder && attachments.length > 0) {
      for (const file of attachments) {
        const maskedFile = this.fileContentMasks.reduce(
          (resultFile, mask) => mask(resultFile),
          file,
        );

        try {
          const encodedFile = await this.fileContentEncoder.encode(maskedFile);
          const encoded = encodedFile.llmEncoded || [];

          encoded.forEach(({ contentType, data }) => {
            if (['text', 'json'].includes(contentType)) {
              userParts.push({
                type: 'text',
                text: `File name: ${file.name}\nFile content: ${data}`,
              });
            } else if (contentType === 'base64_image') {
              userParts.push({ type: 'file', mediaType: 'image/*', data, filename: file.name });
            }
          });
        } catch {
          // Skip unsupported file types silently
        }
      }
    }

    return {
      role: 'user',
      content: userParts.length ? (userParts as any) : [{ type: 'text', text: '' }],
    } as any;
  }

  /**
   * Applies the processor to AgentState:
   * - appends the turn input as a user message into canonical conversation history
   * - marks injected for idempotency during multi-step runs
   */
  async process(state: TurnProcessorState): Promise<ModelMessage[] | null> {
    if (state.hasTurnInputInjected()) {
      return null;
    }

    const instruction = state.getUserQueryText() ?? '';
    const attachments = state.getAttachments();
    const currentHistory = state.getConversationHistory();

    state.markTurnInputInjected();
    const userMessage = await this.buildUserTurnMessage({ instruction, attachments });
    return [...currentHistory, userMessage];
  }
}
