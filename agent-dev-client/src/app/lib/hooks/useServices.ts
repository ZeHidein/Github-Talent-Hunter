import type { Container } from '../../container';
import { createUseServicesHook } from '../hooks/createUseServicesHook';

export const useServices = createUseServicesHook<Container>();
