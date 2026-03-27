import type { FC } from 'react';
import { Skeleton } from '@/app/agent/shadcdn/skeleton';
import type { HTMLMotionProps } from 'framer-motion';

type Props = {} & HTMLMotionProps<'div'>;

export const SkeletonMessagePlaceholder: FC<Props> = (props) => {
  return (
    <div id="component-placeholder" className="w-full text-center py-6 max-w-container-xl mx-auto">
      <div className="my-7 mx-auto w-1/2 h-9">
        <Skeleton className="h-full bg-card" {...props} />
      </div>
      <div className="w-full h-52">
        <Skeleton className="h-full bg-card" {...props} />
      </div>
    </div>
  );
};
