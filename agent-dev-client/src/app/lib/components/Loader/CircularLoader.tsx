import type { FC } from 'react';
import { cn } from '../../utils';

interface CircularLoaderProps {
  className?: string;
  size?: number;
}

export const CircularLoader: FC<CircularLoaderProps> = ({ className, size = 64 }) => {
  return (
    <div className={cn('relative', className)} style={{ width: size, height: size }}>
      <svg
        className="w-full h-full animate-spin"
        style={{ animationDuration: '0.8s' }}
        viewBox="0 0 64 64"
        fill="none"
      >
        <title>Loading...</title>
        <circle
          cx="32"
          cy="32"
          r="30"
          stroke="url(#circularLoaderGradient)"
          strokeWidth="1"
          strokeLinecap="round"
          strokeDasharray="50 150"
        />
        <defs>
          <linearGradient id="circularLoaderGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.2" />
            <stop offset="50%" stopColor="hsl(var(--muted-foreground))" stopOpacity="1" />
            <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.2" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
};
