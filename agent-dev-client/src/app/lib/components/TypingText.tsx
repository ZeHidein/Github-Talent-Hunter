import type React from 'react';
import { useState, useEffect, useRef } from 'react';

const DEFAULT_CHARS_PER_FRAME = 3;

type TypingTextProps = {
  text: string;
  speed?: number;
  charsPerFrame?: number;
  onComplete?: () => void;
  children?: (displayedText: string, isComplete: boolean) => React.ReactNode;
  showCursor?: boolean;
  /**
   * If true, when new text arrives as an appended stream (prefix unchanged),
   * the animation continues without resetting from the start.
   * If false, any text change triggers a full reset.
   */
  continueOnAppend?: boolean;
};

export const TypingText: React.FC<TypingTextProps> = ({
  text = '',
  speed,
  charsPerFrame = DEFAULT_CHARS_PER_FRAME,
  onComplete,
  children,
  showCursor = false,
  continueOnAppend = true,
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const animationRef = useRef<number | ReturnType<typeof setTimeout> | null>(null);
  const indexRef = useRef(0);
  const targetTextRef = useRef<string>(text);
  const lastTextRef = useRef<string>('');

  // Update target text on external text changes.
  useEffect(() => {
    const prev = lastTextRef.current;
    const isAppend = continueOnAppend && text.length >= prev.length && text.startsWith(prev);
    targetTextRef.current = text;
    lastTextRef.current = text;

    if (!isAppend) {
      // Full reset if not an append or continueOnAppend disabled
      setDisplayedText('');
      setIsComplete(false);
      indexRef.current = 0;
      // Stop any running animation so we can restart
      if (animationRef.current !== null) {
        if (typeof animationRef.current === 'number') {
          cancelAnimationFrame(animationRef.current);
        } else {
          clearTimeout(animationRef.current);
        }
        animationRef.current = null;
      }
    } else {
      // If more text arrived, we are no longer complete
      if (text.length > indexRef.current && isComplete) {
        setIsComplete(false);
      }
    }

    // Ensure animation is running if we have more to reveal
    if (indexRef.current < targetTextRef.current.length && animationRef.current === null) {
      const start = () => {
        const animate = () => {
          const target = targetTextRef.current;
          if (indexRef.current >= target.length) {
            setIsComplete(true);
            onComplete?.();
            animationRef.current = null;
            return;
          }

          if (speed == null) {
            const nextIndex = Math.min(target.length, indexRef.current + charsPerFrame);
            setDisplayedText(target.substring(0, nextIndex));
            indexRef.current = nextIndex;
            animationRef.current = requestAnimationFrame(animate);
          } else {
            const nextIndex = indexRef.current + 1;
            setDisplayedText(target.substring(0, nextIndex));
            indexRef.current = nextIndex;
            animationRef.current = setTimeout(animate, speed);
          }
        };
        animate();
      };
      start();
    }
  }, [text, speed, charsPerFrame, onComplete, continueOnAppend]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current !== null) {
        if (typeof animationRef.current === 'number') {
          cancelAnimationFrame(animationRef.current);
        } else {
          clearTimeout(animationRef.current);
        }
        animationRef.current = null;
      }
    };
  }, []);

  if (children) {
    return <>{children(displayedText, isComplete)}</>;
  }

  return (
    <div className="relative inline">
      <span>{displayedText}</span>
      {!isComplete && showCursor && (
        <span className="inline-block w-[2px] h-[1.2em] bg-current animate-pulse ml-[2px] align-middle" />
      )}
    </div>
  );
};
