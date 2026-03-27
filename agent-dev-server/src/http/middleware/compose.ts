import type { IncomingMessage, ServerResponse } from 'node:http';

export type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
export type Middleware = (handler: Handler) => Handler;

/**
 * Compose middleware right-to-left: compose(a, b)(handler) = a(b(handler))
 */
export function compose(...middlewares: Middleware[]): Middleware {
  return (handler) => middlewares.reduceRight((next, mw) => mw(next), handler);
}
