import { useEffect, useRef } from 'react';

type MousePosition = { x: number; y: number };

/**
 * Tracks the latest mouse position in a ref without causing re-renders.
 * Returns a ref with the current clientX/clientY.
 */
export function useMousePosition(enabled: boolean = true) {
  const positionRef = useRef<MousePosition>({ x: 0, y: 0 });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      positionRef.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [enabled]);

  return positionRef;
}
