import { forwardRef, type HTMLAttributes, type PropsWithChildren } from 'react';
import { cn } from '@/app/lib/utils';

type Props = HTMLAttributes<HTMLDivElement> & {
  isUpdated?: boolean;
  onAnimationComplete?: () => void;
};

export const MessageContainer = forwardRef<HTMLDivElement, PropsWithChildren<Props>>(
  function MessageContainer({ children, className, ...props }, ref) {
    return (
      <div
        className={cn(
          'mx-auto flex flex-col [&:not(:first-child)]:mt-6 relative empty:hidden',
          className,
        )}
        ref={ref}
        {...props}
      >
        {children}
      </div>
    );
  },
);
