import {
  ToolModel,
  type ToolExecuteResult,
  type ToolExecuteContext,
  type ToolParameters,
} from './tool-model.js';
import type { ToolCall } from './tool-call.js';
import type { UiSink } from '../kernel/ui-sink.js';
import type { ToolInvocationContext } from '../kernel/tooling.js';

export interface ComponentToolConfig<TParams extends Record<string, unknown>> {
  name: string;
  description: string;
  schema: ToolParameters;
  componentName?: string;
  isStrict?: boolean;
}

/**
 * A specialized ToolModel for rendering UI components.
 *
 * Uses the execute() API - kernel automatically manages ToolPart state machine:
 * - input-streaming: Shows streaming preview while LLM generates args
 * - input-available: Args are complete
 * - output-pending: Tool is executing
 * - output-available: Component is rendered with props
 *
 * @example
 * ```typescript
 * const weatherTool = createComponentTool({
 *   name: 'ShowWeather',
 *   description: 'Display weather information',
 *   schema: z.object({ city: z.string(), temp: z.number() }),
 *   componentName: 'WeatherCard',
 * });
 * ```
 */
export class ComponentToolModel<
  T extends Record<string, unknown> = Record<string, unknown>,
> extends ToolModel<T> {
  private readonly _componentName: string;

  constructor(config: ComponentToolConfig<T>) {
    const componentName = config.componentName ?? config.name;

    super({
      name: config.name,
      description: config.description,
      parametersSchema: config.schema,
      toolType: 'function',
      isStrict: config.isStrict ?? false,
      isStreaming: true,
    });

    this._componentName = componentName;
  }

  /**
   * Execute the component tool - returns props for UI rendering.
   * Kernel manages state machine and emits ToolPart content.
   */
  async execute(input: T, _ctx: ToolExecuteContext): Promise<ToolExecuteResult> {
    return {
      output: 'displayed',
      uiProps: input as Record<string, unknown>,
    };
  }

  /**
   * Get the UI component name for rendering.
   */
  getComponentName(): string {
    return this._componentName;
  }

  /**
   * Legacy call() - throws error, use execute() instead.
   * @deprecated
   */
  async call(
    _toolCall: ToolCall<T>,
    _ui: UiSink,
    _ctx: ToolInvocationContext<unknown>,
  ): Promise<string> {
    throw new Error('ComponentToolModel uses execute() API. Kernel should not call call().');
  }
}

/**
 * Factory function to create a component tool.
 *
 * @example
 * ```typescript
 * const showWeatherTool = createComponentTool({
 *   name: 'ShowWeather',
 *   description: 'Display weather information',
 *   schema: z.object({
 *     city: z.string(),
 *     temperature: z.number(),
 *   }),
 *   componentName: 'WeatherCard',
 * });
 * ```
 */
export function createComponentTool<TParams extends Record<string, unknown>>(
  config: ComponentToolConfig<TParams>,
): ComponentToolModel<TParams> {
  return new ComponentToolModel(config);
}

/**
 * Type guard to check if a ToolModel is a ComponentToolModel.
 */
export function isComponentTool(
  tool: ToolModel<unknown>,
): tool is ComponentToolModel<Record<string, unknown>> {
  return tool instanceof ComponentToolModel;
}
