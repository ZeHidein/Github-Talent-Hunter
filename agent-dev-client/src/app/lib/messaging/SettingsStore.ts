import { observable, action } from 'mobx';

import { trpc } from '@/app/lib/trpc';
import type { AgentSettings } from '@/app/lib/types';
import type { MemoryStore } from './MemoryStore';

export class SettingsStore {
  @observable accessor agentId: string | null = null;
  @observable accessor currentModelId: string | null = null;
  @observable accessor currentModelDisplayName: string | null = null;
  @observable accessor loading: boolean = false;
  @observable accessor error: string | null = null;

  private readonly memoryStore: MemoryStore;

  constructor(memoryStore: MemoryStore) {
    this.memoryStore = memoryStore;
  }

  @action.bound
  async load() {
    if (this.loading) {
      return;
    }

    this.loading = true;
    this.error = null;

    try {
      const settings = (await trpc.platform.settings.query()) as AgentSettings;
      this.agentId = settings.agentId;
      this.currentModelId = settings.modelId;
      this.currentModelDisplayName = settings.displayName;

      // Initialize memory store with agent-specific ID
      if (settings.agentId) {
        this.memoryStore.initialize(settings.agentId);
      }
    } catch (error: any) {
      console.error('Failed to load agent settings:', error);
      this.error = error?.message || 'Failed to load settings';
    } finally {
      this.loading = false;
    }
  }
}
