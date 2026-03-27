import { Readable } from 'node:stream';
import type { AgentStreamEvent } from '../runners/agent-runner.ts';

/**
 * Sink interface for event streams.
 */
export interface EventSink {
  append(event: AgentStreamEvent): void;
  endStream(): void;
  isEnded(): boolean;
}

/**
 * Buffered readable stream for agent events.
 * Similar to ContentStream but for raw AgentStreamEvent.
 */
export class EventStream extends Readable implements EventSink {
  private events: AgentStreamEvent[] = [];
  private hasEnded: boolean = false;

  constructor(options?: ConstructorParameters<typeof Readable>[0]) {
    super({ ...options, objectMode: true });
  }

  _read(): void {
    let pushed = true;
    while (pushed && this.events.length > 0 && !this.hasEnded) {
      const event = this.events.shift();
      pushed = this.push(event);
    }
    if (this.hasEnded && this.events.length === 0) {
      this.push(null);
    }
  }

  isEnded(): boolean {
    return this.hasEnded;
  }

  append(event: AgentStreamEvent): void {
    this.events.push(event);
    this.emit('data', event);
    this._read();
  }

  endStream(): void {
    this.hasEnded = true;
    this.emit('end');
    this._read();
  }

  _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    this.events = [];
    this.push(null);
    callback(error);
  }
}
