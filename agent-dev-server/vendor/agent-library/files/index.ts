// File encoding utilities
export {
  FileContentEncoder,
  type ConvertFilesResult,
  type FileEncoderConfig,
  DEFAULT_FILE_ENCODER_CONFIG,
} from './file-content-encoder.ts';
export { omitTextContentBySize } from './file-content-masks.ts';

// Interfaces and types
export type {
  AttachmentExtended,
  Base64EncodedImage,
  EncodedText,
  FileEncodedContent,
  FileCodecI,
  FileContentMask,
} from './interfaces.ts';

// Supported file types
export {
  FILE_ENCODER_IMAGE_EXTENSIONS,
  FILE_ENCODER_WORD_EXTENSIONS,
  FILE_ENCODER_EXCEL_EXTENSIONS,
  FILE_ENCODER_PDF_EXTENSIONS,
  FILE_ENCODER_TEXT_EXTENSIONS,
  FILE_ENCODER_PDF_MIME_TYPES,
  FILE_ENCODER_WORD_MIME_TYPES,
  FILE_ENCODER_EXCEL_MIME_TYPES,
  FILE_ENCODER_IMAGE_MIME_TYPES,
  FILE_ENCODER_TEXT_MIME_TYPES,
  FILE_ENCODER_SUPPORTED_EXTENSIONS,
  FILE_ENCODER_SUPPORTED_MIME_TYPES,
  FILE_NATIVE_TEXT_EXTENSIONS,
  FILE_NATIVE_TEXT_AND_IMAGE_EXTENSIONS,
  getFileEncoderProducedContentTypesByExtension,
  type FileEncoderSupportedExtension,
  type FileEncoderSupportedMimeType,
  type FileEncoderProducedContentType,
} from './supported-file-types.ts';

// Individual codecs (for advanced use cases)
export { TextCodec } from './codecs/text-codec.ts';
export { ImageCodec } from './codecs/image-codec.ts';
export { PdfCodec } from './codecs/pdf-codec.ts';
export { ExcelCodec } from './codecs/excel-codec.ts';
export { WordCodec } from './codecs/word-codec.ts';
