import compression from 'compression';
import type { Middleware } from './compose';

/**
 * Compression — uses the `compression` npm package as Connect-compatible middleware.
 * Works without Express: compression() returns (req, res, next) => void.
 */
export const compressionMiddleware: Middleware = (next) => {
  const compress = compression();
  return (req, res) => {
    compress(req as any, res as any, () => next(req, res));
  };
};
