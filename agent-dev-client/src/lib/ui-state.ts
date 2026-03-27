/**
 * UI State Derivation Logic
 *
 * Convention-based approach to derive active UI components from conversation history.
 * Uses special props to indicate update/remove actions without modifying agent-library.
 *
 * Conventions:
 * - Show: Normal ComponentContent (no special markers)
 * - Update: ComponentContent with `__target` prop pointing to messageId to update
 * - Remove: ComponentContent with componentName '__Remove' and `__target` prop
 */

import {
  type AgentContent,
  type ComponentContent,
  ContentType,
  isComponentContent,
} from './agent-library';

// Convention markers
const TARGET_PROP = '__target';
const REMOVE_COMPONENT_NAME = '__Remove';

/**
 * Check if content is a component update (has __target prop).
 */
export function isComponentUpdate(content: AgentContent): boolean {
  if (!isComponentContent(content)) {
    return false;
  }
  return TARGET_PROP in content.props;
}

/**
 * Check if content is a component removal.
 */
export function isComponentRemoval(content: AgentContent): boolean {
  if (!isComponentContent(content)) {
    return false;
  }
  return content.componentName === REMOVE_COMPONENT_NAME;
}

/**
 * Get target messageId from update/remove content.
 */
export function getTargetMessageId(content: ComponentContent): string | undefined {
  return content.props[TARGET_PROP] as string | undefined;
}

/**
 * Remove convention markers from props before rendering.
 */
export function cleanProps(props: Record<string, unknown>): Record<string, unknown> {
  const { [TARGET_PROP]: _, ...cleanedProps } = props;
  return cleanedProps;
}

/**
 * Derive active UI components from conversation history.
 *
 * Processes all ComponentContent items in history and applies show/update/remove
 * semantics to build the current UI state.
 *
 * @param history - Full conversation history from server
 * @returns Map of active components keyed by messageId
 */
export function deriveActiveComponents(history: AgentContent[]): Map<string, ComponentContent> {
  const components = new Map<string, ComponentContent>();

  for (const item of history) {
    // Only process Component content
    if (item.type !== ContentType.Component) {
      continue;
    }

    const comp = item as ComponentContent;
    const targetId = getTargetMessageId(comp);

    if (isComponentRemoval(comp) && targetId) {
      // Remove: delete the target component
      components.delete(targetId);
    } else if (targetId) {
      // Update: merge props into target (excluding __target)
      const target = components.get(targetId);
      if (target) {
        const cleanedProps = cleanProps(comp.props);
        components.set(targetId, {
          ...target,
          props: { ...target.props, ...cleanedProps },
          // Preserve streaming state from update if present, otherwise keep target's
          streaming: comp.streaming ?? target.streaming,
        });
      }
      // If target doesn't exist, ignore the update (target was removed or never existed)
    } else {
      // Show: add new component (or replace if same messageId from server re-sync)
      components.set(comp.messageId, comp);
    }
  }

  return components;
}

/**
 * Get ordered list of active components (preserves insertion order).
 */
export function getActiveComponentsList(history: AgentContent[]): ComponentContent[] {
  const components = deriveActiveComponents(history);
  return Array.from(components.values());
}
