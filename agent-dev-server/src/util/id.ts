import { randomBytes } from 'crypto';

export function generateRandomString(length: number): string {
  if (length <= 0) {
    throw new Error('Length must be a positive integer.');
  }

  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charsetLength = charset.length;
  const maxByte = 256;
  const acceptableMax = Math.floor(maxByte / charsetLength) * charsetLength; // 248

  let result = '';
  while (result.length < length) {
    const randomBuffer = randomBytes(1);
    const randomByte = randomBuffer[0];

    if (randomByte < acceptableMax) {
      result += charset[randomByte % charsetLength];
    }
  }
  return result;
}
