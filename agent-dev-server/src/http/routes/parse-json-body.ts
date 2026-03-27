import type { IncomingMessage } from 'node:http';

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export async function parseJsonBody<T = unknown>(
  req: IncomingMessage,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;

    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > maxBytes) {
        req.destroy();
        reject(Object.assign(new Error('Payload too large'), { statusCode: 413 }));
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}
