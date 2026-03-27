export interface AgentLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const noopLogger: AgentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

let globalLogger: AgentLogger = console;

export function setAgentLogger(logger: AgentLogger): void {
  globalLogger = logger;
}

export function getAgentLogger(): AgentLogger {
  return globalLogger;
}
