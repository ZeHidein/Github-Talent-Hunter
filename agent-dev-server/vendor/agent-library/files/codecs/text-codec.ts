import type { Attachment } from '../../core/interfaces.ts';
import type { EncodedText, FileCodecI } from '../interfaces.ts';
import { removeBase64Prefix } from './utils.ts';

/**
 * Provides encoding functionality for text-based files.
 */
export class TextCodec implements FileCodecI {
  /**
   * Encodes a given file attachment into a text-based format.
   *
   * @param {Attachment} file The file attachment to be encoded.
   * @returns {Promise<EncodedText>} A promise that resolves to the encoded text object,
   *                                  including the content type and the data as a string.
   */
  async encode(file: Attachment): Promise<EncodedText[]> {
    const cleanData = removeBase64Prefix(file.data || '');
    // Decode from base64 if the data appears to be base64-encoded
    const text = this.isBase64(cleanData)
      ? Buffer.from(cleanData, 'base64').toString('utf-8')
      : cleanData;

    return [
      {
        contentType: 'text',
        data: text || '(empty)',
      },
    ];
  }

  /**
   * Simple check if a string appears to be base64 encoded
   */
  private isBase64(str: string): boolean {
    if (!str || str.length === 0) {
      return false;
    }
    // Base64 strings should only contain these characters and be properly padded
    const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Pattern.test(str.trim());
  }
}
