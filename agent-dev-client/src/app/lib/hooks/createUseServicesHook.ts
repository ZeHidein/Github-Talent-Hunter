import type { Context } from 'react';
import { ServicesContext, useContextIfExists } from '../contexts';

export const createUseServicesHook = <ServicesContainer>(): (() => ServicesContainer) => {
  return () => {
    const services = useContextIfExists<ServicesContainer>(
      ServicesContext as unknown as Context<ServicesContainer>,
    );

    return services;
  };
};
