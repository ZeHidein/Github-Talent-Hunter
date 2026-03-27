import { type Context, useContext } from 'react';

export const useContextIfExists = <T>(context: Context<T>) => {
  const contextValue = useContext(context);

  if (contextValue === undefined) {
    throw new Error(`${context} Cant be used outside of context provider`);
  }

  return contextValue;
};
