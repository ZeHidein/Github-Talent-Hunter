import type { TraceOrchestrator } from './trace-orchestrator.ts';
import { LangfuseTraceOrchestrator, type LangfuseClient } from './langfuse-trace-orchestrator.ts';
import { getAgentLogger } from '../types/logger.ts';

let globalLangfuseOrchestrator: TraceOrchestrator | null = null;
const logger = getAgentLogger();

export function setLangfuseClient(
  client: LangfuseClient,
  getContext?: () => { userId?: string; agentId?: string; requestId?: string } | null,
): void {
  globalLangfuseOrchestrator = new LangfuseTraceOrchestrator({ client, getContext });
  logger.info('[Langfuse] Trace orchestrator initialized');
}

export function getLangfuseTraceOrchestrator(): TraceOrchestrator | null {
  return globalLangfuseOrchestrator;
}
