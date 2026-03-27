import { textExtensions } from '../util/extensions.ts';

/**
 * Central list of file types supported by `FileContentEncoder`.
 *
 * This describes what **this codebase** can ingest and convert into model-consumable
 * "primitive" parts (text/json/base64_image). It is intentionally decoupled from
 * provider/model capabilities ("native" support) which is tracked in `ModelCard`.
 */

export const FILE_ENCODER_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg'] as const;
export const FILE_ENCODER_WORD_EXTENSIONS = ['doc', 'docx'] as const;
export const FILE_ENCODER_EXCEL_EXTENSIONS = ['xlsx'] as const;
export const FILE_ENCODER_PDF_EXTENSIONS = ['pdf'] as const;

export const FILE_ENCODER_TEXT_EXTENSIONS = textExtensions;

export const FILE_ENCODER_PDF_MIME_TYPES = ['application/pdf'] as const;
export const FILE_ENCODER_WORD_MIME_TYPES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;
export const FILE_ENCODER_EXCEL_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
] as const;
export const FILE_ENCODER_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg'] as const;
export const FILE_ENCODER_TEXT_MIME_TYPES = [
  'text/plain',
  'text/csv',
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'application/json',
  'application/xml',
  'text/xml',
] as const;

export type FileEncoderSupportedExtension =
  | (typeof FILE_ENCODER_PDF_EXTENSIONS)[number]
  | (typeof FILE_ENCODER_WORD_EXTENSIONS)[number]
  | (typeof FILE_ENCODER_EXCEL_EXTENSIONS)[number]
  | (typeof FILE_ENCODER_IMAGE_EXTENSIONS)[number]
  | (typeof FILE_ENCODER_TEXT_EXTENSIONS)[number];

export type FileEncoderSupportedMimeType =
  | (typeof FILE_ENCODER_PDF_MIME_TYPES)[number]
  | (typeof FILE_ENCODER_WORD_MIME_TYPES)[number]
  | (typeof FILE_ENCODER_EXCEL_MIME_TYPES)[number]
  | (typeof FILE_ENCODER_IMAGE_MIME_TYPES)[number]
  | (typeof FILE_ENCODER_TEXT_MIME_TYPES)[number];

export type FileEncoderProducedContentType = 'text' | 'json' | 'base64_image';

export const FILE_ENCODER_SUPPORTED_EXTENSIONS: readonly string[] = [
  ...FILE_ENCODER_PDF_EXTENSIONS,
  ...FILE_ENCODER_WORD_EXTENSIONS,
  ...FILE_ENCODER_EXCEL_EXTENSIONS,
  ...FILE_ENCODER_IMAGE_EXTENSIONS,
  ...FILE_ENCODER_TEXT_EXTENSIONS,
];

export const FILE_ENCODER_SUPPORTED_MIME_TYPES: readonly string[] = [
  ...FILE_ENCODER_PDF_MIME_TYPES,
  ...FILE_ENCODER_WORD_MIME_TYPES,
  ...FILE_ENCODER_EXCEL_MIME_TYPES,
  ...FILE_ENCODER_IMAGE_MIME_TYPES,
  ...FILE_ENCODER_TEXT_MIME_TYPES,
];

/**
 * For "native" support (no preprocessing) we treat all text extensions as directly includable,
 * and optionally include a small image allowlist (only formats currently accepted by the encoder).
 *
 * Exported as constants to avoid re-allocating large arrays in hot paths.
 */
export const FILE_NATIVE_TEXT_EXTENSIONS: readonly string[] = FILE_ENCODER_TEXT_EXTENSIONS;
export const FILE_NATIVE_TEXT_AND_IMAGE_EXTENSIONS: readonly string[] = [
  ...FILE_ENCODER_TEXT_EXTENSIONS,
  ...FILE_ENCODER_IMAGE_EXTENSIONS,
];

export function getFileEncoderProducedContentTypesByExtension(
  extension: string | undefined | null,
): readonly FileEncoderProducedContentType[] {
  const ext = (extension ?? '').toLowerCase();
  if (!ext) {
    return [];
  }

  if (FILE_ENCODER_IMAGE_EXTENSIONS.includes(ext as any)) {
    return ['base64_image'];
  }
  if (FILE_ENCODER_EXCEL_EXTENSIONS.includes(ext as any)) {
    return ['json'];
  }
  if (
    FILE_ENCODER_PDF_EXTENSIONS.includes(ext as any) ||
    FILE_ENCODER_WORD_EXTENSIONS.includes(ext as any) ||
    FILE_ENCODER_TEXT_EXTENSIONS.includes(ext as any)
  ) {
    return ['text'];
  }

  return [];
}
