import type { Base64EncodedImage, FileCodecI } from '../interfaces.ts';
import type { Attachment } from '../../core/interfaces.ts';
import { imageSignatures } from './utils.ts';
import { getAgentLogger } from '../../types/logger.ts';

const logger = getAgentLogger();

/**
 * Provides functionality for encoding image files into a base64-encoded format.
 */
export class ImageCodec implements FileCodecI {
  /**
   * Encodes an image file into a base64-encoded string.
   *
   * @param {Attachment} rawFile The image file to be encoded. The file must include
   * both the data of the file (binary) and its MIME type.
   * @returns {Promise<Base64EncodedImage>} A promise that resolves to an object
   * containing the base64-encoded image data and its content type.
   */
  async encode(rawFile: Attachment): Promise<Base64EncodedImage[]> {
    const file = this.getFixedImageSignature(rawFile);

    if (file.data.startsWith('data:image')) {
      return [
        {
          contentType: 'base64_image',
          data: file.data,
        },
      ];
    }

    return [
      {
        contentType: 'base64_image',
        data: `data:${file.type};base64,${file.data}`,
      },
    ];
  }

  private getFixedImageSignature(file: Attachment): Attachment {
    const imageBase64 = file.data?.startsWith('data:image')
      ? file.data.split('base64,')[1]
      : file.data;
    const signature = imageSignatures.find((signature) =>
      imageBase64.startsWith(signature.base64Prefix),
    );
    if (!signature) {
      logger.warn(`[ImageCodec] No signature found for image file ${file.name}`);
      return file;
    }

    if (signature.mediaType === file.type) {
      return file;
    }

    // Fix type according to signature
    return {
      ...file,
      type: signature.mediaType,
      data: `data:${signature.mediaType};base64,${imageBase64}`,
    };
  }
}
