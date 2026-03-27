import { createContext } from 'react';
import type { Container } from '../../container';

export const ServicesContext = createContext<Container | undefined>(undefined);
