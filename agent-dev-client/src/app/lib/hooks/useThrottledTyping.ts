import { useState, useEffect, useRef } from 'react';

export const useThrottledTyping = (
  text: string,
  speed: number = 30, // ms per char
  throttleDelay: number = 50, // Minimum ms between React renders
) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  // Refs for state that updates 60fps without triggering re-renders
  const progressRef = useRef(0);
  const lastRenderTimeRef = useRef(0);
  const requestRef = useRef<number>();
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    // Reset if text completely changes (not just appending)
    if (!text.startsWith(displayedText) && displayedText !== '') {
      progressRef.current = 0;
      setDisplayedText('');
      setIsComplete(false);
      startTimeRef.current = null;
    }

    const animate = (time: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = time;
      }

      const timeElapsed = time - startTimeRef.current;
      // Calculate how many chars should be visible based on speed
      const targetIndex = Math.min(text.length, Math.floor(timeElapsed / speed));

      progressRef.current = targetIndex;

      // THROTTLE: Only update React State if enough time has passed
      // or if we finished typing.
      const shouldRender =
        time - lastRenderTimeRef.current > throttleDelay || targetIndex === text.length;

      if (shouldRender) {
        setDisplayedText(text.slice(0, targetIndex));
        lastRenderTimeRef.current = time;
      }

      if (targetIndex < text.length) {
        requestRef.current = requestAnimationFrame(animate);
      } else {
        setIsComplete(true);
      }
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [text, speed, throttleDelay]); // displayedText omitted intentionally

  return { displayedText, isComplete };
};
