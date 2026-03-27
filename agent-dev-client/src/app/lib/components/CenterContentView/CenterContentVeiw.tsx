import type { FC, PropsWithChildren } from 'react';

export const CenterContentView: FC<PropsWithChildren> = ({ children }) => {
  return <div className="h-full w-full flex-center flex-col p-4">{children}</div>;
};
