export interface AuthStrategy {
  init(): Promise<void>;
  getHeaders(): Record<string, string>;
  createWebSocket(url: string, protocols?: string | string[]): WebSocket;
  destroy(): void;
}

export class CookieAuth implements AuthStrategy {
  async init(): Promise<void> {}

  getHeaders(): Record<string, string> {
    return {};
  }

  createWebSocket(url: string, protocols?: string | string[]): WebSocket {
    return new WebSocket(url, protocols || undefined);
  }

  destroy(): void {}
}
