import type Agent from './agent';
import type { CreateAgentParams } from './interfaces';

export type CreateAgent = (params: CreateAgentParams) => Agent;
