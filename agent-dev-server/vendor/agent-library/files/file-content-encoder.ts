import { textExtensions } from '../util/extensions.ts';
import type { AttachmentExtended, FileCodecI } from './interfaces.ts';

import { PdfCodec } from './codecs/pdf-codec.ts';
import { ExcelCodec } from './codecs/excel-codec.ts';
import { WordCodec } from './codecs/word-codec.ts';
import { TextCodec } from './codecs/text-codec.ts';
import { ImageCodec } from './codecs/image-codec.ts';
import type { Attachment } from '../core/interfaces.ts';
import {
  FILE_ENCODER_EXCEL_EXTENSIONS,
  FILE_ENCODER_EXCEL_MIME_TYPES,
  FILE_ENCODER_IMAGE_EXTENSIONS,
  FILE_ENCODER_IMAGE_MIME_TYPES,
  FILE_ENCODER_PDF_MIME_TYPES,
  FILE_ENCODER_TEXT_MIME_TYPES,
  FILE_ENCODER_WORD_EXTENSIONS,
  FILE_ENCODER_WORD_MIME_TYPES,
} from './supported-file-types.ts';

export type ConvertFilesResult = Array<AttachmentExtended>;

/**
 * Configuration for which file encoders to enable.
 * All encoders are enabled by default.
 */
export interface FileEncoderConfig {
  /** Enable PDF text extraction (requires pdf-parse) */
  pdf?: boolean;
  /** Enable Word document text extraction (requires mammoth) */
  word?: boolean;
  /** Enable Excel spreadsheet extraction (requires read-excel-file) */
  excel?: boolean;
  /** Enable image base64 encoding */
  image?: boolean;
  /** Enable text file encoding */
  text?: boolean;
}

/**
 * Default encoder configuration - all enabled
 */
export const DEFAULT_FILE_ENCODER_CONFIG: Required<FileEncoderConfig> = {
  pdf: true,
  word: true,
  excel: true,
  image: true,
  text: true,
};

function buildCodecMaps(config: Required<FileEncoderConfig>): {
  codecMap: Record<string, FileCodecI>;
  mimetypeCodecMap: Record<string, FileCodecI>;
} {
  const codecMap: Record<string, FileCodecI> = {};
  const mimetypeCodecMap: Record<string, FileCodecI> = {};

  if (config.pdf) {
    const pdfCodec = new PdfCodec();
    codecMap.pdf = pdfCodec;
    FILE_ENCODER_PDF_MIME_TYPES.forEach((mimetype) => {
      mimetypeCodecMap[mimetype] = pdfCodec;
    });
  }

  if (config.word) {
    const wordCodec = new WordCodec();
    FILE_ENCODER_WORD_EXTENSIONS.forEach((ext) => {
      codecMap[ext] = wordCodec;
    });
    FILE_ENCODER_WORD_MIME_TYPES.forEach((mimetype) => {
      mimetypeCodecMap[mimetype] = wordCodec;
    });
  }

  if (config.excel) {
    const excelCodec = new ExcelCodec();
    FILE_ENCODER_EXCEL_EXTENSIONS.forEach((ext) => {
      codecMap[ext] = excelCodec;
    });
    FILE_ENCODER_EXCEL_MIME_TYPES.forEach((mimetype) => {
      mimetypeCodecMap[mimetype] = excelCodec;
    });
  }

  if (config.image) {
    const imageCodec = new ImageCodec();
    FILE_ENCODER_IMAGE_EXTENSIONS.forEach((ext) => {
      codecMap[ext] = imageCodec;
    });
    FILE_ENCODER_IMAGE_MIME_TYPES.forEach((mimetype) => {
      mimetypeCodecMap[mimetype] = imageCodec;
    });
  }

  if (config.text) {
    const textCodec = new TextCodec();
    textExtensions.forEach((ext) => {
      codecMap[ext] = textCodec;
    });
    FILE_ENCODER_TEXT_MIME_TYPES.forEach((mimetype) => {
      mimetypeCodecMap[mimetype] = textCodec;
    });
  }

  return { codecMap, mimetypeCodecMap };
}

/**
 * Provides functionality to encode files into a format compatible with LLM.
 * It utilizes different codecs based on file extensions to convert files into
 * a unified format for processing. Falls back to mimetype-based codec selection
 * when extension-based lookup fails.
 *
 * @example
 * ```typescript
 * // All encoders enabled (default)
 * const encoder = new FileContentEncoder();
 *
 * // Only enable specific encoders
 * const encoder = new FileContentEncoder({
 *   pdf: true,
 *   image: true,
 *   text: false,
 *   word: false,
 *   excel: false,
 * });
 * ```
 */
export class FileContentEncoder {
  private readonly codecMap: Record<string, FileCodecI>;
  private readonly mimetypeCodecMap: Record<string, FileCodecI>;

  constructor(config: FileEncoderConfig = {}) {
    const fullConfig: Required<FileEncoderConfig> = {
      ...DEFAULT_FILE_ENCODER_CONFIG,
      ...config,
    };
    const maps = buildCodecMaps(fullConfig);
    this.codecMap = maps.codecMap;
    this.mimetypeCodecMap = maps.mimetypeCodecMap;
  }

  /**
   * Encodes each file content using the appropriate codec based on the file extension.
   * @param {Attachment[]} files - The files to be encoded.
   * @returns {Promise<ConvertFilesResult>} A promise that resolves to an array
   * of `AttachmentExtended` objects.
   * @throws {Error} Throws an error if the file extension is not supported.
   */
  async encodeFiles(files: Attachment[]): Promise<ConvertFilesResult> {
    const results = await Promise.all(files.map((file) => this.encode(file)));
    return results.filter(Boolean) as ConvertFilesResult;
  }

  /**
   * Encodes a single file's content using the appropriate codec based on the file extension.
   * Falls back to mimetype if extension-based lookup fails.
   * @param {Attachment} file - The file to be encoded.
   * @returns {Promise<AttachmentExtended>} A promise that resolves to
   * an `AttachmentExtended` object.
   * @throws {Error} Throws an error if neither the file extension nor mimetype is supported.
   */
  async encode(file: Attachment): Promise<AttachmentExtended> {
    const extension = file.name.split('.').pop()?.toLowerCase();
    let codec = this.codecMap[extension!];

    // Fallback to mimetype if extension-based lookup fails
    if (!codec && file.type) {
      codec = this.mimetypeCodecMap[file.type.toLowerCase()];
    }

    if (!codec) {
      const errorMessage = file.type
        ? `Neither extension "${extension}" nor mimetype "${file.type}" is supported`
        : `Extension "${extension}" is not supported`;
      throw new Error(errorMessage);
    }

    const content = await codec.encode(file);
    return {
      ...file,
      llmEncoded: content,
    };
  }
}

export default FileContentEncoder;
