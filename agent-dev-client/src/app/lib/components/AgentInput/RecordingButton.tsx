import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioRecorderContext } from '@/app/lib/contexts';
import { cn } from '@/app/lib/utils';
import { motion, useMotionValue, useMotionTemplate, useAnimationFrame } from 'framer-motion';

import './style.css';

type RecordingButtonProps = {
  isLoading: boolean;
  isPlaying: boolean;
  className?: string;
  onClick(): void;
};

export const RecordingButton: React.FC<RecordingButtonProps> = ({
  onClick,
  isLoading,
  isPlaying,
  className = '',
}) => {
  const { subscribeToProgress, isRecording, isPending } = useAudioRecorderContext();

  // Keep track of the latest volume
  const latestVolumeRef = useRef<number>(0);

  const updateLevel = useCallback(
    (level: number) => {
      const newStartPercentage = Math.min(Math.max(0.02, level * 1000), 100);
      offsetPercentage.set(newStartPercentage / 10);
      opacity.set(Math.max(newStartPercentage / 100, 0.2));
      latestVolumeRef.current = level;
    },
    [latestVolumeRef],
  );

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isPlaying) {
      interval = setInterval(() => {
        const max = 0.8;
        const min = 0.1;
        const level = (Math.random() * (max - min + 1) + min) / 10;
        updateLevel(level);
      }, 100);
    } else {
      opacity.set(0);
      clearInterval(interval!);
    }

    return () => {
      clearInterval(interval!);
    };
  }, [isPlaying]);

  // Set up a subscription to get volume updates
  useEffect(() => {
    const handleProgress = (_audioBuffer: AudioBuffer, level: number) => {
      latestVolumeRef.current = level;
    };

    const unsubscribeProgress = subscribeToProgress(handleProgress);
    return () => {
      unsubscribeProgress();
    };
  }, [subscribeToProgress]);

  const opacity = useMotionValue<number>(0.02);
  const offsetPercentage = useMotionValue(0);

  // Update startPercentage on each animation frame
  useAnimationFrame(() => {
    if (isRecording) {
      const volume = latestVolumeRef.current;
      updateLevel(volume);
    }
  });

  // Create the background gradient using the motion value
  const opacityTemplate = useMotionTemplate`${opacity}`;
  const offsetTemplate = useMotionTemplate`translate(-50%, -50%)`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'recording-button w-full overflow-hidden h-[42px] min-w-[120px] max-w-[500px] relative z-10 flex-center text-center rounded-full',
        'mx-[8px] p-0',
        'text-white',
        'outline-none transition-all duration-300 ease-out group',
        'bg-transparent',
        !isPending && !isLoading && !isRecording && 'z-100 active:bg-accent',
        className,
      )}
    >
      {isPending && (
        <div className="w-auto z-0 h-auto absolute-inset-overlay rounded-full flex-center bg-gradient-pending" />
      )}
      {isRecording && (
        <div className="w-auto z-0 h-auto absolute-inset-overlay rounded-full flex-center bg-gradient-recording" />
      )}
      {isLoading && !isRecording && !isPending && (
        <div className="w-auto z-0 h-auto absolute-inset-overlay rounded-full flex-center bg-gradient-loading" />
      )}
      {!isPending && !isLoading && !isRecording && (
        <div className="w-auto -z-10 h-auto absolute-inset-overlay rounded-full flex-center bg-gradient-loading" />
      )}

      {/* Content - full opacity */}
      <div className="w-full z-10 h-auto absolute flex-center font-plus-jakarta-sans text-sm font-medium text-white">
        {isPending ? (
          'Initialize...'
        ) : isRecording ? (
          <div
            className={cn(
              'stop w-5 h-5 rounded-[4px] border-[2.5px] border-solid border-white bg-transparent',
            )}
          />
        ) : isLoading ? (
          <span>Answering...</span>
        ) : (
          <span>Tap to speak</span>
        )}
      </div>

      {/* Speaking animation */}
      <motion.div
        className={cn(
          'w-full h-auto pt-[100%] rounded-full pointer-events-none m-auto',
          'left-1/2 top-1/2 absolute transition-all duration-300 z-0',
        )}
        style={{
          opacity: opacityTemplate,
          transform: offsetTemplate,
          backgroundImage: isRecording
            ? 'radial-gradient(circle at 50% 50%, rgb(247 218 154), rgb(214 223 140 / 40%), rgb(181 229 127))'
            : 'radial-gradient(circle at 50% 50%, rgb(96 165 250), rgb(96 165 250 / 40%), rgb(59 130 246))',
        }}
      />

      {/* Hover - subtle white overlay */}
      {!isPending && !isLoading && !isRecording && (
        <div
          className={cn(
            'bg-white/10 display-block w-full inset-0 opacity-0 group-hover:opacity-100',
            'absolute -z-10 transition-all',
          )}
        />
      )}
    </button>
  );
};
