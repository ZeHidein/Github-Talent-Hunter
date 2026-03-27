import type { DependencyContainer } from '../container';
import { getJWTPayload } from './jwt';

export function getConfigId(container: DependencyContainer): string {
  const modelAccessKey = container.settings.getSecret('MODEL_ACCESS_KEY');
  const { agentId } = getJWTPayload<{ agentId: string }>(modelAccessKey);
  return agentId;
}
