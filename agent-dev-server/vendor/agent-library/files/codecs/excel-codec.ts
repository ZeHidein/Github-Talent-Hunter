import readXlsxFile from 'read-excel-file/node';
import type { EncodedText, FileCodecI } from '../interfaces.ts';
import type { Attachment } from '../../core/interfaces.ts';
import { removeBase64Prefix } from './utils.ts';

/**
 * Provides functionality for encoding Excel files into a JSON format.
 */
export class ExcelCodec implements FileCodecI {
  /**
   * Encodes an Excel file into a JSON representation.
   *
   * This method reads the Excel file using the provided Attachment object,
   * converts the rows into a JSON string, and returns an EncodedJson object.
   *
   * @param {Attachment} file The Excel file to be encoded.
   * The file should be in the form of an Attachment object containing the Excel file data.
   * @returns {Promise<EncodedText>} A promise that resolves to an EncodedText object
   * containing the JSON string of the Excel file's rows.
   */
  async encode(file: Attachment): Promise<EncodedText[]> {
    const rows = await readXlsxFile(Buffer.from(removeBase64Prefix(file.data), 'base64'));
    return [
      {
        contentType: 'json',
        data: JSON.stringify(rows),
      },
    ];
  }
}
