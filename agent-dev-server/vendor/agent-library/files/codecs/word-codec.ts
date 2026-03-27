import mammoth from 'mammoth';
import type { EncodedText, FileCodecI } from '../interfaces.ts';
import type { Attachment } from '../../core/interfaces.ts';
import { removeBase64Prefix } from './utils.ts';

/**
 * Provides functionality for encoding Word documents into a text format.
 */
export class WordCodec implements FileCodecI {
  /**
   * Encodes a Word document into a text representation.
   *
   * @param {Attachment} file The Word document to be encoded.
   * The file should be in the form of an Attachment object containing the Word document data.
   * @returns {Promise<EncodedText>} A promise that resolves to an EncodedText object
   * containing the text extracted from the Word document.
   */
  async encode(file: Attachment): Promise<EncodedText[]> {
    const buffer = Buffer.from(removeBase64Prefix(file.data), 'base64');
    const result = await mammoth.extractRawText({ buffer });
    return [
      {
        contentType: 'text',
        data: result.value,
      },
    ];
  }
}
