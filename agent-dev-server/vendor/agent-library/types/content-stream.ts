import { Readable } from 'node:stream';
import type { AgentContent } from './content.ts';
import type { UiSink } from '../kernel/ui-sink.ts';

/**
 * Buffered readable stream for agent content.
 * Implements UiSink for kernel compatibility.
 */
export class ContentStream extends Readable implements UiSink<AgentContent> {
  private contents: AgentContent[] = [];
  private hasEnded: boolean = false;

  constructor(options?: ConstructorParameters<typeof Readable>[0]) {
    super({ ...options, objectMode: true });
  }

  _read(): void {
    let pushed = true;
    while (pushed && this.contents.length > 0 && !this.hasEnded) {
      const content = this.contents.shift();
      pushed = this.push(content);
    }
    if (this.hasEnded && this.contents.length === 0) {
      this.push(null);
    }
  }

  isEnded(): boolean {
    return this.hasEnded;
  }

  append(content: AgentContent): void {
    this.contents.push(content);
    this.emit('data', content);
    this._read();
  }

  endStream(): void {
    this.hasEnded = true;
    this.emit('end');
    this._read();
  }

  _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    this.contents = [];
    this.push(null);
    callback(error);
  }
}
