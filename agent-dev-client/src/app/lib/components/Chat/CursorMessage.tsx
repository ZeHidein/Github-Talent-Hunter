import { cn, isMobile } from '@/app/lib/utils';
import { type FC, useEffect, useRef } from 'react';

export const CursorFollowingMessage: FC<{ message: string; isLoading: boolean }> = ({
  message,
  isLoading,
}) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const isMobileDevice = isMobile();

  useEffect(() => {
    const element = elementRef.current;
    if (!element || isMobileDevice) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      element.style.left = `${e.clientX + 20}px`;
      element.style.top = `${e.clientY + 20}px`;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  // Hide when not loading
  if (!isLoading) {
    return null;
  }

  return (
    <div
      ref={elementRef}
      style={{
        position: 'fixed',
        left: 0,
        right: isMobileDevice ? 0 : 'auto',
        top: isMobileDevice ? 12 : 0,
        zIndex: 999999,
        pointerEvents: 'none',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        fontSize: isMobileDevice ? '14px' : '14px',
        fontWeight: 500,
        maxWidth: isMobileDevice ? 'initial' : '300px',
        textAlign: isMobileDevice ? 'center' : 'left',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div className={cn('rounded-[15px] px-4 py-2', isMobileDevice ? 'bg-card/65' : 'bg-card/50')}>
        <div className="shimmer-text">{message}</div>
      </div>
    </div>
  );
};
