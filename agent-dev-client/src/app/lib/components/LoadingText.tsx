import React from 'react';
import { cn } from '@/app/lib/utils/cn';

interface Props {
  className?: string;
}

export const LoadingText = function LoadingText(props: Props) {
  return (
    <div
      className={cn(
        'loading-indicator font-plus-jakarta-sans text-[16px] font-semibold',
        props.className,
      )}
    >
      <span>Loading</span>
      <span className="dot">.</span>
      <span className="dot">.</span>
      <span className="dot">.</span>
      <style>{`
        .loading-indicator {
          display: inline-block;
        }

        .dot {
          animation: blink 1.4s infinite;
          opacity: 0;
        }

        .dot:nth-child(2) {
          animation-delay: 0.2s;
        }

        .dot:nth-child(3) {
          animation-delay: 0.4s;
        }

        .dot:nth-child(4) {
          animation-delay: 0.6s;
        }

        @keyframes blink {
          0%, 20% {
            opacity: 0;
          }
          40% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};
