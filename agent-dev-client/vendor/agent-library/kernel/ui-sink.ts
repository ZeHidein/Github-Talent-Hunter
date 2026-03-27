export interface UiSink<TContent = unknown> {
  isEnded(): boolean;
  append(content: TContent): void;
  endStream(): void;
}
