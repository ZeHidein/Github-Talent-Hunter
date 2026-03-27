/**
 * Streaming JSON Parser
 *
 * An incremental JSON parser that extracts string key-value pairs
 * from partial/incomplete JSON as it streams in.
 *
 * Designed for handling LLM tool argument streaming where you want to
 * display values (like file paths and content) as they're being typed.
 *
 * @example
 * ```typescript
 * const parser = createStreamingJsonParser();
 *
 * // Feed chunks as they arrive
 * parser.feed('{"path":"src/');
 * console.log(parser.getValues()); // { path: 'src/' }
 *
 * parser.feed('Button.tsx","content":"import');
 * console.log(parser.getValues()); // { path: 'src/Button.tsx', content: 'import' }
 * ```
 */

export type StreamingJsonState = {
  buffer: string;
  values: Record<string, string>;
  currentKey: string | null;
  currentValue: string;
  inString: boolean;
  inKey: boolean;
  escaped: boolean;
  depth: number;
  parsedIndex: number;
};

export type StreamingJsonParser = {
  /** Feed a delta (chunk of JSON text) to the parser */
  feed(delta: string): void;
  /** Get all currently extracted key-value pairs */
  getValues(): Record<string, string>;
  /** Get a specific value by key */
  getValue(key: string): string | undefined;
  /** Reset parser state for a new stream */
  reset(): void;
  /** Get the raw buffer */
  getBuffer(): string;
  /** Debug: get current internal state */
  getState(): StreamingJsonState;
};

/**
 * Create a new streaming JSON parser instance.
 *
 * The parser processes JSON incrementally, extracting string values
 * as they are typed. It handles:
 * - Escape sequences (`\n`, `\t`, `\"`, `\\`, `\uXXXX`, etc.)
 * - Nested objects (tracks depth)
 * - In-progress strings (returns partial values)
 */
export function createStreamingJsonParser(): StreamingJsonParser {
  const state: StreamingJsonState = {
    buffer: '',
    values: {},
    currentKey: null,
    currentValue: '',
    inString: false,
    inKey: false,
    escaped: false,
    depth: 0,
    parsedIndex: 0,
  };

  function parse(): void {
    for (let i = state.parsedIndex; i < state.buffer.length; i++) {
      const char = state.buffer[i];

      if (state.escaped) {
        if (state.inString) {
          if (char === 'n') {
            state.currentValue += '\n';
          } else if (char === 't') {
            state.currentValue += '\t';
          } else if (char === 'r') {
            state.currentValue += '\r';
          } else if (char === '\\') {
            state.currentValue += '\\';
          } else if (char === '"') {
            state.currentValue += '"';
          } else if (char === '/') {
            state.currentValue += '/';
          } else if (char === 'b') {
            state.currentValue += '\b';
          } else if (char === 'f') {
            state.currentValue += '\f';
          } else if (char === 'u') {
            // Unicode escape - handle \uXXXX
            if (i + 4 < state.buffer.length) {
              const hex = state.buffer.slice(i + 1, i + 5);
              if (/^[0-9a-fA-F]{4}$/.test(hex)) {
                state.currentValue += String.fromCharCode(parseInt(hex, 16));
                i += 4;
                state.parsedIndex = i + 1;
                state.escaped = false;
                continue;
              }
            }
            // Not enough chars for unicode yet, wait for more
            state.escaped = true;
            return;
          } else {
            // Unknown escape, just add the character
            state.currentValue += char;
          }
        }
        state.escaped = false;
        state.parsedIndex = i + 1;
        continue;
      }

      if (char === '\\' && state.inString) {
        state.escaped = true;
        state.parsedIndex = i + 1;
        continue;
      }

      if (char === '"') {
        if (!state.inString) {
          // Starting a string
          state.inString = true;
          state.currentValue = '';

          // Determine if this is a key or value by looking backwards
          let foundColon = false;
          let foundBraceOrComma = false;
          for (let j = i - 1; j >= 0; j--) {
            const prevChar = state.buffer[j];
            if (prevChar === ' ' || prevChar === '\n' || prevChar === '\r' || prevChar === '\t') {
              continue;
            }
            if (prevChar === ':') {
              foundColon = true;
              break;
            }
            if (prevChar === '{' || prevChar === ',') {
              foundBraceOrComma = true;
              break;
            }
            break;
          }
          state.inKey = foundBraceOrComma && !foundColon;
        } else {
          // Ending a string
          if (state.inKey) {
            state.currentKey = state.currentValue;
          } else if (state.currentKey) {
            state.values[state.currentKey] = state.currentValue;
            state.currentKey = null;
          }
          state.inString = false;
          state.inKey = false;
          state.currentValue = '';
        }
        state.parsedIndex = i + 1;
        continue;
      }

      if (state.inString) {
        state.currentValue += char;
        state.parsedIndex = i + 1;
        continue;
      }

      // Track object depth
      if (char === '{') {
        state.depth++;
      } else if (char === '}') {
        state.depth--;
      }

      state.parsedIndex = i + 1;
    }
  }

  return {
    feed(delta: string): void {
      state.buffer += delta;
      parse();
    },

    getValues(): Record<string, string> {
      // Include in-progress value if we're in the middle of a string value
      if (state.currentKey && state.inString && !state.inKey) {
        return {
          ...state.values,
          [state.currentKey]: state.currentValue,
        };
      }
      return { ...state.values };
    },

    getValue(key: string): string | undefined {
      return this.getValues()[key];
    },

    reset(): void {
      state.buffer = '';
      state.values = {};
      state.currentKey = null;
      state.currentValue = '';
      state.inString = false;
      state.inKey = false;
      state.escaped = false;
      state.depth = 0;
      state.parsedIndex = 0;
    },

    getBuffer(): string {
      return state.buffer;
    },

    getState(): StreamingJsonState {
      return { ...state };
    },
  };
}
