export const imageSignatures = [
  {
    mediaType: 'image/gif' as const,
    bytesPrefix: [0x47, 0x49, 0x46],
    base64Prefix: 'R0lG',
  },
  {
    mediaType: 'image/png' as const,
    bytesPrefix: [0x89, 0x50, 0x4e, 0x47],
    base64Prefix: 'iVBORw',
  },
  {
    mediaType: 'image/jpeg' as const,
    bytesPrefix: [0xff, 0xd8],
    base64Prefix: '/9j/',
  },
  {
    mediaType: 'image/webp' as const,
    bytesPrefix: [0x52, 0x49, 0x46, 0x46],
    base64Prefix: 'UklGR',
  },
  {
    mediaType: 'image/bmp' as const,
    bytesPrefix: [0x42, 0x4d],
    base64Prefix: 'Qk',
  },
  {
    mediaType: 'image/tiff' as const,
    bytesPrefix: [0x49, 0x49, 0x2a, 0x00],
    base64Prefix: 'SUkqAA',
  },
  {
    mediaType: 'image/tiff' as const,
    bytesPrefix: [0x4d, 0x4d, 0x00, 0x2a],
    base64Prefix: 'TU0AKg',
  },
  {
    mediaType: 'image/avif' as const,
    bytesPrefix: [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66],
    base64Prefix: 'AAAAIGZ0eXBhdmlm',
  },
  {
    mediaType: 'image/heic' as const,
    bytesPrefix: [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63],
    base64Prefix: 'AAAAIGZ0eXBoZWlj',
  },
] as const;

/**
 * Removes the data URI prefix from a base64 string if present.
 *
 * Common data URI prefixes include:
 * - data:application/pdf;base64,
 * - data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,
 * - data:image/png;base64,
 * - etc.
 *
 * @param data The base64 string that may contain a data URI prefix
 * @returns The base64 string without the prefix
 *
 * @example
 * removeBase64Prefix('data:application/pdf;base64,JVBERi0xLjQ...')
 * // Returns: 'JVBERi0xLjQ...'
 *
 * removeBase64Prefix('JVBERi0xLjQ...')
 * // Returns: 'JVBERi0xLjQ...' (no change if no prefix)
 */
export function removeBase64Prefix(data: string): string {
  const dataUriPattern = /^data:[^;]+;base64,/;
  return data.replace(dataUriPattern, '');
}
