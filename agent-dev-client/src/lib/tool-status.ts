import { ContentType, type AgentContent, type ComponentContent } from '@/lib/agent-library';

export type ToolVisualState = 'streaming' | 'pending' | 'running' | 'complete' | 'error';

export type NewToolCall = {
  toolCallId: string;
  toolName: string;
};

const HIDDEN_TOOL_NAMES = new Set(['StateUpdate']);

export function getToolName(component: ComponentContent): string {
  return component.streaming?.toolName || component.componentName;
}

export function isToolComponent(content: AgentContent): content is ComponentContent {
  if (content.type !== ContentType.Component) {
    return false;
  }
  const component = content as ComponentContent;
  if (!component.streaming) {
    return false;
  }
  const toolName = getToolName(component);
  return !HIDDEN_TOOL_NAMES.has(toolName);
}

/**
 * Find a new tool that just started streaming (input-streaming state)
 * and hasn't been shown in status yet.
 */
export function findNewStreamingTool(
  contents: AgentContent[],
  alreadyShownIds: Set<string>,
): NewToolCall | null {
  for (const content of contents) {
    if (!isToolComponent(content)) {
      continue;
    }
    const component = content as ComponentContent;
    if (component.streaming?.state !== 'input-streaming') {
      continue;
    }
    const toolCallId = component.streaming.toolCallId;
    if (alreadyShownIds.has(toolCallId)) {
      continue;
    }
    return {
      toolCallId,
      toolName: getToolName(component),
    };
  }
  return null;
}

/**
 * Check if there's active reasoning text being streamed.
 */
export function hasActiveReasoning(contents: AgentContent[]): boolean {
  // Check the last text content - if it's reasoning and we're still streaming, return true
  for (let i = contents.length - 1; i >= 0; i--) {
    const content = contents[i];
    if (content.type === ContentType.Text) {
      const textContent = content as { isReasoning?: boolean };
      return textContent.isReasoning === true;
    }
  }
  return false;
}

export function getToolVisualState(component: ComponentContent): ToolVisualState {
  const state = component.streaming?.state;
  if (state === 'input-streaming') {
    return 'streaming';
  }
  if (state === 'input-available') {
    return 'pending';
  }
  if (state === 'output-pending') {
    return 'running';
  }
  if (state === 'output-error') {
    return 'error';
  }
  if (state === 'output-available') {
    return 'complete';
  }
  return 'complete';
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function summarizeValue(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return truncate(value, maxLength);
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return truncate(String(value), maxLength);
  }
  try {
    const json = JSON.stringify(value);
    if (typeof json === 'string') {
      return truncate(json, maxLength);
    }
  } catch {
    // fall through
  }
  try {
    return truncate(String(value), maxLength);
  } catch {
    return null;
  }
}

/**
 * Get a summary of tool input (used by ToolPart for detailed display).
 */
export function getToolInputSummary(
  component: ComponentContent,
  maxLength: number = 60,
): string | null {
  const input = component.streaming?.input ?? component.props;
  return summarizeValue(input, maxLength);
}

/**
 * Get a summary of tool output (used by ToolPart for detailed display).
 */
export function getToolOutputSummary(
  component: ComponentContent,
  maxLength: number = 60,
): string | null {
  const output = component.streaming?.output ?? component.props;
  return summarizeValue(output, maxLength);
}
