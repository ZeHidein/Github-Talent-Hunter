import type { FC } from 'react';
import type { ComponentConfigT, McpConfigT } from '@/app/lib/types';

class ComponentRegistry {
  private components: Record<string, FC<any>> = {};
  private configs: Record<string, ComponentConfigT> = {};

  register<P>(config: ComponentConfigT | McpConfigT, component: FC<P>) {
    if (this.components[config.name]) {
      console.warn(`Component ${config.name} is already registered.`);
      return;
    }
    if (config.type === 'component') {
      this.configs[config.name] = config;
    }
    this.components[config.name] = component;
  }

  getComponents() {
    return this.components;
  }

  getConfigs() {
    return this.configs;
  }
}

const registry = new ComponentRegistry();

export function registerComponent(config: ComponentConfigT | McpConfigT) {
  return function <P>(component: FC<P>): FC<P> {
    registry.register(config, component);
    return component;
  };
}

export function getRegisteredComponents() {
  return registry.getComponents();
}

export function getComponentConfigs() {
  return registry.getConfigs();
}
