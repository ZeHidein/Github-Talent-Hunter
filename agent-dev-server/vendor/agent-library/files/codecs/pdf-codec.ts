import { PDFParse } from 'pdf-parse';
import type { Base64EncodedImage, EncodedText, FileCodecI } from '../interfaces.ts';
import type { Attachment } from '../../core/interfaces.ts';
import { removeBase64Prefix } from './utils.ts';

/**
 * Provides functionality for encoding PDF files into a text format.
 */
export class PdfCodec implements FileCodecI {
  /**
   * Encodes a PDF file into a text representation.
   *
   * @param {Attachment} file The PDF file to be encoded.
   * The file should be in the form of an Attachment object containing the PDF data.
   * @returns {Promise<EncodedText>} A promise that resolves to an EncodedText object
   * containing the text extracted from the PDF file.
   */
  async encode(file: Attachment): Promise<(EncodedText | Base64EncodedImage)[]> {
    const buffer = Buffer.from(removeBase64Prefix(file.data), 'base64');
    const pdfData = new PDFParse({ data: buffer });
    const pdfText = await pdfData.getText();
    const text = pdfText.text?.trim() || '';
    return [
      {
        contentType: 'text',
        data: text,
      },
    ];
  }
}
