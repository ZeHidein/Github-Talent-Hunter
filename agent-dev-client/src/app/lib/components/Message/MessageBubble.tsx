import { motion } from 'framer-motion';
import type React from 'react';
import type { FC, PropsWithChildren } from 'react';

import type { MessageTypeT } from './types';
import { cn } from '../../utils';

const TRANSITION = { duration: 0.3 };
const ANIMATE = { opacity: 1, y: 0 };
const INITIAL = { opacity: 0, y: 20 };

type Props = {
  type: MessageTypeT;
  noStyle: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export const MessageBubble: FC<PropsWithChildren<Props>> = ({
  children,
  type,
  noStyle,
  className,
}) => {
  return (
    <motion.div
      className={cn('flex', type === 'outgoing' ? 'justify-end' : 'justify-start')}
      initial={INITIAL}
      animate={ANIMATE}
      transition={TRANSITION}
    >
      <div
        className={cn(
          !noStyle && 'rounded-full py-2 px-4',
          type === 'outgoing' && !noStyle && 'bg-primary text-primary-foreground',
          type === 'incoming' && !noStyle && 'bg-secondary text-secondary-foreground',
          className,
        )}
      >
        {children}
      </div>
    </motion.div>
  );
};
