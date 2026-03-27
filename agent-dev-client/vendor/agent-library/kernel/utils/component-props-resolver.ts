/**
 * ComponentPropsResolver
 *
 * Stateful helper for parsing streaming tool input JSON (`inputDelta`) into a structured object.
 * This is environment-agnostic (Node + browser).
 */

import {
  ContentType,
  type ComponentContent,
  toComponentProps,
  type ComponentProps,
} from '../../types/content.ts';
import { parse as parsePartialJson, disableErrorLogging } from 'best-effort-json-parser';

disableErrorLogging();

export interface ResolvedComponentProps<
  TProps = Record<string, unknown>,
  TInput = Record<string, unknown>,
> extends ComponentProps<TProps, TInput> {
  streamingInput: TInput;
}

export class ComponentPropsResolver {
  private lastParsedInput = new Map<string, Record<string, unknown>>();

  resolve<TProps = Record<string, unknown>, TInput = Record<string, unknown>>(
    content: ComponentContent | null | undefined,
  ): ResolvedComponentProps<TProps, TInput> {
    const base = toComponentProps<TProps, TInput>(
      content ??
        ({
          type: ContentType.Component,
          messageId: '',
          componentName: '',
          props: {},
        } as ComponentContent),
    );

    const emptyResult: ResolvedComponentProps<TProps, TInput> = {
      ...base,
      streamingInput: {} as TInput,
    };

    if (!content) {
      return emptyResult;
    }

    const inputDelta = content.streaming?.inputDelta;
    const toolCallId = content.streaming?.toolCallId;
    if (!inputDelta || !toolCallId) {
      return emptyResult;
    }

    const streamingInput = this.parseStreamingInput(toolCallId, inputDelta);
    return {
      ...base,
      streamingInput: streamingInput as TInput,
    };
  }

  /**
   * Decode the best-effort parsed streaming tool args for this component.
   *
   * This is a convenience wrapper around `resolve().streamingInput` so application code can keep
   * `unknown` parsing at a single boundary (e.g. `decode(input) => T | null`).
   */
  decode<TInput = Record<string, unknown>, TResult = unknown>(
    content: ComponentContent | null | undefined,
    decode: (input: TInput) => TResult | null,
  ): TResult | null {
    const resolved = this.resolve<Record<string, unknown>, TInput>(content);
    return decode(resolved.streamingInput);
  }

  reset(): void {
    this.lastParsedInput.clear();
  }

  resetToolCall(toolCallId: string): void {
    this.lastParsedInput.delete(toolCallId);
  }

  private parseStreamingInput(toolCallId: string, inputDelta: string): Record<string, unknown> {
    const trimmed = inputDelta.trim();
    if (!trimmed.startsWith('{')) {
      return this.lastParsedInput.get(toolCallId) ?? {};
    }

    try {
      const parsed = parsePartialJson(inputDelta);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        this.lastParsedInput.set(toolCallId, parsed as Record<string, unknown>);
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore
    }
    return this.lastParsedInput.get(toolCallId) ?? {};
  }
}

export function createComponentPropsResolver(): ComponentPropsResolver {
  return new ComponentPropsResolver();
}
