import type { Attachment } from '../core/interfaces.ts';
import type { FileContentMask } from './interfaces.ts';
import { textExtensions } from '../util/extensions.ts';
import { getAgentLogger } from '../types/logger.ts';

const logger = getAgentLogger();

/**
 * A {@link FileContentMask} function to omit the text content of files exceeding
 * a specified size limit. If the file exceeds the limit, its data is replaced with
 * a placeholder string '(omitted)'.
 *
 * @param textSizeLimitBytes - The maximum allowed size of the file in bytes.
 * @returns A `FileContentMask` function that takes an `Attachment` object and returns it,
 * possibly with its `data` property modified if the file's content
 * is omitted due to size constraints.
 */
export function omitTextContentBySize(textSizeLimitBytes: number): FileContentMask {
  return (file: Attachment): Attachment => {
    if (
      textExtensions.includes(file.name.split('.').pop()?.toLowerCase() as string) &&
      file.data?.length > textSizeLimitBytes
    ) {
      const sizeInKb = parseFloat((file.data.length / 1024).toFixed(2));
      logger.debug(
        `File ${file.name} omitted due to size limit: ${sizeInKb} kB > ${textSizeLimitBytes / 1024} kB`,
      );
      return {
        ...file,
        data: '(omitted)',
      };
    }
    return file;
  };
}
