import type { FC } from 'react';
import { CircularLoader } from './CircularLoader';

export const LoaderBlocker: FC = () => {
  return (
    <div className="bg-background/[0.5] rounded-[20px] absolute top-0 bottom-0 left-0 right-0 flex justify-center items-center z-10">
      <CircularLoader />
    </div>
  );
};
