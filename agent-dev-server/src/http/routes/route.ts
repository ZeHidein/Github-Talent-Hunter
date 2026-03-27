import type { IncomingMessage, ServerResponse } from 'node:http';

export type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

export interface Route {
  matches(method: string, url: string): boolean;
  handler: Handler;
}
