import { observable, action, computed } from 'mobx';
import type { MemoryEntry } from '@/app/lib/services/websocket-client.types';

const MEMORY_STORAGE_KEY_PREFIX = 'agentplace_memory_bank';
const MAX_MEMORY_ITEMS = 15;

export class MemoryStore {
  @observable accessor memories: MemoryEntry[] = [];
  @observable accessor initialized: boolean = false;

  private agentId: string | null = null;

  private getStorageKey(): string {
    if (!this.agentId) {
      throw new Error('MemoryStore not initialized');
    }
    return `${MEMORY_STORAGE_KEY_PREFIX}_${this.agentId}`;
  }

  @computed
  get count(): number {
    return this.memories.length;
  }

  @computed
  get isEmpty(): boolean {
    return this.memories.length === 0;
  }

  /**
   * Initialize the memory store with an agent-specific ID.
   * Must be called after agentId is known (e.g., after settings load).
   */
  @action.bound
  initialize(agentId: string) {
    this.agentId = agentId;
    this.loadFromStorage();
    this.initialized = true;
    console.log(`[MemoryStore] Initialized for agent: ${agentId}`);
  }

  @action.bound
  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.getStorageKey());
      if (stored) {
        this.memories = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load memories from storage:', error);
      this.memories = [];
    }
  }

  @action.bound
  private saveToStorage() {
    try {
      localStorage.setItem(this.getStorageKey(), JSON.stringify(this.memories));
    } catch (error) {
      console.error('Failed to save memories to storage:', error);
    }
  }

  @action.bound
  add(summary: string) {
    const newMemory: MemoryEntry = {
      id: crypto.randomUUID(),
      summary,
      timestamp: Date.now(),
    };
    this.memories = [...this.memories, newMemory];
    this.saveToStorage();
    console.log(`[MemoryStore] Saved memory: "${summary}"`);
  }

  @action.bound
  remove(id: string) {
    this.memories = this.memories.filter((m) => m.id !== id);
    this.saveToStorage();
  }

  @action.bound
  clear() {
    this.memories = [];
    this.saveToStorage();
  }

  /**
   * Returns the most recent memories, sorted by timestamp (oldest first),
   * limited to MAX_MEMORY_ITEMS.
   * Returns empty array if store is not initialized.
   */
  getAll(): MemoryEntry[] {
    if (!this.initialized) {
      console.warn('[MemoryStore] getAll() called before initialization');
      return [];
    }
    return [...this.memories].sort((a, b) => a.timestamp - b.timestamp).slice(-MAX_MEMORY_ITEMS);
  }

  getById(id: string): MemoryEntry | undefined {
    return this.memories.find((m) => m.id === id);
  }
}
