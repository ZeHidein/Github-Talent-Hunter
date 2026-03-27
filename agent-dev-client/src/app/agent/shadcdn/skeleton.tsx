import { type HTMLMotionProps, motion } from 'framer-motion';
import { cn } from '@/app/lib/utils';

function Skeleton({ className, ...props }: HTMLMotionProps<'div'>) {
  return (
    <motion.div
      className={cn('rounded-md bg-muted', className)}
      animate={{
        opacity: [1, 0.5, 1],
      }}
      transition={{
        duration: 2,
        ease: [0.4, 0, 0.6, 1],
        repeat: Infinity,
        repeatDelay: 0.5,
      }}
      {...props}
    />
  );
}

export { Skeleton };
