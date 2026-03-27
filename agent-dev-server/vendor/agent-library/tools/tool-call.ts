export class ToolCall<T = unknown> {
  public readonly id: string;
  public readonly name: string;
  public readonly rawArgs: string;
  public readonly parsedArgs: T;
  public readonly metadata: Record<string, unknown>;
  public readonly isStreaming: boolean;
  public readonly finishReason: string;

  constructor(params: {
    id: string;
    name: string;
    rawArgs?: string;
    parsedArgs?: T;
    metadata?: Record<string, unknown>;
    isStreaming?: boolean;
    finishReason?: string;
  }) {
    this.id = params.id;
    this.name = params.name;
    this.rawArgs = params.rawArgs ?? JSON.stringify(params.parsedArgs);
    this.parsedArgs = params.parsedArgs as T;
    this.metadata = params.metadata ?? {};
    this.isStreaming = params.isStreaming ?? false;
    this.finishReason = params.finishReason ?? 'completed';
  }

  getId(): string {
    return this.id;
  }

  getName(): string {
    return this.name;
  }

  getRawArguments(): string {
    return this.rawArgs;
  }

  getMetadata(): Record<string, unknown> {
    return this.metadata;
  }

  getMetadataValue<V = unknown>(key: string): V | undefined {
    return this.metadata[key] as V;
  }

  getParsedArguments(): T {
    return this.parsedArgs;
  }

  getIsStreaming(): boolean {
    return this.isStreaming;
  }

  getFinishReason(): string | null {
    return (this.metadata?.finishReason as string) ?? 'completed';
  }

  getIndex(): number {
    return (this.metadata?.index as number) ?? 0;
  }

  withMetadata(additionalMetadata: Record<string, unknown>): ToolCall<T> {
    return new ToolCall({
      id: this.id,
      name: this.name,
      parsedArgs: this.parsedArgs,
      rawArgs: this.rawArgs,
      metadata: { ...this.metadata, ...additionalMetadata },
    });
  }

  withArguments<U>(newArguments: U): ToolCall<U> {
    return new ToolCall({
      id: this.id,
      name: this.name,
      parsedArgs: newArguments,
      rawArgs: JSON.stringify(newArguments),
      metadata: this.metadata,
    });
  }
}
