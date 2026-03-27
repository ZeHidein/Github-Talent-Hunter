type Callback = () => void;

class InvalidationRegistry {
  #callbacks = new Map<string, Set<Callback>>();

  subscribe(topic: string, callback: Callback): () => void {
    if (!this.#callbacks.has(topic)) {
      this.#callbacks.set(topic, new Set());
    }
    this.#callbacks.get(topic)!.add(callback);
    return () => {
      const set = this.#callbacks.get(topic);
      if (set) {
        set.delete(callback);
        if (set.size === 0) this.#callbacks.delete(topic);
      }
    };
  }

  notify(topic: string): void {
    this.#callbacks.get(topic)?.forEach((cb) => {
      cb();
    });
  }

  notifyAll(): void {
    for (const set of this.#callbacks.values()) {
      set.forEach((cb) => {
        cb();
      });
    }
  }
}

export const invalidationRegistry = new InvalidationRegistry();
