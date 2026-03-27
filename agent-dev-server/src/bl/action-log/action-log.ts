export interface ActionLogEntry {
  timestamp: number;
  action: string; // 'draft.created', 'draft.marked_urgent'
  summary: string; // 'Created draft "Meeting notes" for john@acme.com'
  data?: Record<string, unknown>;
}

export class ActionLog {
  #entries: ActionLogEntry[] = [];
  readonly #maxEntries: number;

  constructor(options?: { maxEntries?: number }) {
    this.#maxEntries = options?.maxEntries ?? 100;
  }

  append(entry: Omit<ActionLogEntry, 'timestamp'>): void {
    this.#entries.push({ ...entry, timestamp: Date.now() });
    if (this.#entries.length > this.#maxEntries) {
      this.#entries = this.#entries.slice(-this.#maxEntries);
    }
  }

  flush(): ActionLogEntry[] {
    const flushed = [...this.#entries];
    this.#entries = [];
    return flushed;
  }

  peek(): readonly ActionLogEntry[] {
    return this.#entries;
  }

  get size(): number {
    return this.#entries.length;
  }
}
