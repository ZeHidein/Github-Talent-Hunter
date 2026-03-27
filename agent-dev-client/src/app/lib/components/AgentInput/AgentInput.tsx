import {
  type ChangeEventHandler,
  type FC,
  type KeyboardEventHandler,
  type PropsWithChildren,
  useState,
  useEffect,
  useRef,
} from 'react';

import { ArrowUp, Mic } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useAudioRecorderContext } from '@/app/lib/contexts';
import { useMessagingStore } from '@/app/lib/hooks/useMessagingStore';
import { useGlobalAudioPlayer } from 'react-use-audio-player';
import { AdaptiveWaveform } from './AdaptiveWaveform';
import { AISpeakingIndicator } from './AISpeakingIndicator';
import { VoiceModeControls } from './VoiceModeControls';

import { cn } from '@/app/lib/utils';
import { useIsMobile, useServices } from '@/app/lib/hooks';
import { Button } from '@/app/agent/shadcdn';

export interface Props extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
  speechEnabled: boolean;
  showSwitch: boolean;
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onChange: ChangeEventHandler<HTMLTextAreaElement>;
  onSpeechToggle: () => void;
  onStopStreaming?: () => void;
  onSendClick?: () => void;
  // optional
  placeholder?: string;
  recordingButtonClassName?: string;
  inputClassName?: string;
  isUserRequestPending?: boolean;
}

type SpeechButtonProps = {
  speechEnabled: boolean;
  onSpeechToggle: () => void;
  className?: string;
};

type SendButtonProps = {
  onSendClick?: () => void;
  disabled?: boolean;
  className?: string;
};

type StopButtonProps = {
  onStop: () => void;
  className?: string;
};

const SpeechButton: FC<PropsWithChildren<SpeechButtonProps>> = ({
  speechEnabled,
  onSpeechToggle,
  children,
  className,
}) => {
  return (
    <Button
      variant="outline"
      size="icon"
      className={cn(
        'rounded-full outline-none focus:outline-none',
        'w-10 h-10',
        'flex-center',
        'border-none cursor-pointer',
        'transition-all duration-200 ease-out group',
        'bg-transparent shadow-none',
        speechEnabled && 'hover:bg-foreground/20 active:bg-foreground/30',
        'stroke-primary',
        className,
      )}
      onClick={onSpeechToggle}
    >
      {children}
    </Button>
  );
};

const SendButton: FC<SendButtonProps> = ({ onSendClick, disabled, className }) => {
  return (
    <Button
      variant="outline"
      size="icon"
      className={cn(
        'rounded-full outline-none focus:outline-none',
        'w-10 h-10',
        'flex-center',
        'border-none cursor-pointer',
        'transition-all duration-200 ease-out group',
        'bg-muted text-muted-foreground shadow-none',
        disabled && 'opacity-40 cursor-not-allowed',
        className,
      )}
      onClick={onSendClick}
    >
      <ArrowUp size={20} />
    </Button>
  );
};

const StopButton: FC<StopButtonProps> = ({ onStop, className }) => {
  return (
    <Button
      variant="outline"
      size="icon"
      className={cn(
        'rounded-full outline-none focus:outline-none',
        'w-10 h-10',
        'flex-center',
        'border-none cursor-pointer',
        'transition-all duration-200 ease-out group',
        'bg-muted text-muted-foreground shadow-none ',
        className,
      )}
      onClick={onStop}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="transition-all duration-30"
        aria-labelledby="stop-icon-title"
      >
        <title id="stop-icon-title">Stop</title>
        <rect
          x="3"
          y="3"
          width="18"
          height="18"
          rx="4"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Button>
  );
};

const ModelLabel: FC = observer(() => {
  const { settingsStore } = useServices();
  const displayName = settingsStore.currentModelDisplayName;

  if (!displayName) {
    return null;
  }

  return (
    <span className="px-3 py-1.5 text-sm font-medium text-muted-foreground">{displayName}</span>
  );
});

export const AgentInput: FC<Props> = observer(function AgentInput(props: Props) {
  const {
    speechEnabled,
    showSwitch = true,
    onSpeechToggle,
    onStopStreaming,
    onSendClick,
    isUserRequestPending,
    className,
    recordingButtonClassName,
    inputClassName,
    placeholder,
    ...rest
  } = props;

  const effectivePlaceholder = isUserRequestPending ? 'Generating response...' : placeholder;

  const [isFocused, setIsFocused] = useState(false);
  const [keepScaled, setKeepScaled] = useState(false);
  const animationTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { isRecording, isPending } = useAudioRecorderContext();
  const { playing } = useGlobalAudioPlayer();
  const { isRecordingAudio } = useMessagingStore();
  const isMobile = useIsMobile();

  const isAISpeaking = playing;
  const isWaveformActive = isRecordingAudio || isAISpeaking;

  useEffect(() => {
    if (speechEnabled) {
      setKeepScaled(true);
    }
  }, [speechEnabled]);

  useEffect(() => {
    if (!isFocused && !speechEnabled) {
      const timeout = setTimeout(() => {
        setKeepScaled(false);
      }, 150);
      return () => clearTimeout(timeout);
    }
  }, [isFocused, speechEnabled]);

  useEffect(() => {
    return () => {
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
      }
    };
  }, []);

  const handleBlur = () => {
    setIsFocused(false);
  };

  return (
    <div className="rounded-input w-full pointer-events-none">
      {speechEnabled ? (
        <div className="w-full relative">
          <div className="w-full h-36 px-6 pt-0 pb-0 sm:pb-4 mb-0 pointer-events-none">
            <AdaptiveWaveform
              isActive={isWaveformActive}
              // Use live recorder state for color scheme (yellow-green when user is speaking)
              isListening={isRecording}
              isAISpeaking={isAISpeaking}
            />
          </div>

          <div className="absolute left-0 right-0 bottom-0 flex flex-col sm:flex-row items-center sm:items-end justify-end sm:justify-between gap-2 sm:gap-0 px-2 sm:px-8 mb-0">
            <AISpeakingIndicator
              isAISpeaking={isAISpeaking}
              isPending={isPending}
              isRecording={isRecording}
            />
            <VoiceModeControls
              isUserRequestPending={!!isUserRequestPending}
              onCancel={onSpeechToggle}
            />
          </div>
        </div>
      ) : (
        // Normal text input mode - only when speechEnabled is false
        <div
          className={cn(
            'holder rounded-[32px] relative overflow-hidden mb-0 pointer-events-none',
            'flex flex-col',
            'transition-all duration-300 ease-in-out',
            'bg-background/30',
            'backdrop-blur-xl backdrop-saturate-150',
            'border border-border outline-none',
            'shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.2)]',
            isFocused &&
              'ring-none shadow-[0_12px_40px_rgba(0,0,0,0.1),0_4px_12px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.3)]',
            (isFocused || keepScaled) && 'scale-[1.02]',
            className,
          )}
        >
          {/* Progress */}

          {/* Textarea area */}
          <div
            className={cn(
              'textarea flex-1 pt-5 pb-1 overflow-hidden relative z-10 pointer-events-auto',
            )}
          >
            <textarea
              {...rest}
              placeholder={effectivePlaceholder}
              onFocus={() => setIsFocused(true)}
              onBlur={handleBlur}
              className={cn(
                'overflow-y-auto scrollbar-none field-sizing-content max-h-[8lh] min-h-[2lh]',
                'size-full resize-none pb-0 px-6',
                'font-plus-jakarta-sans text-base font-normal',
                'bg-transparent border-none focus:outline-none',
                'text-foreground placeholder:text-muted-foreground placeholder:text-body-base',
                inputClassName,
              )}
            />
          </div>

          {/* Bottom controls bar */}
          <div
            className={cn(
              'controls flex flex-row items-center justify-between px-4 pb-3 pt-0 relative z-10 pointer-events-auto',
            )}
          >
            {/* Left side: current model label */}
            <ModelLabel />

            {/* Right side: mic + send/stop buttons */}
            <div className="flex flex-row items-center gap-2">
              {/* Microphone button - always visible, left of send/stop */}
              <SpeechButton
                className={cn(
                  'grow-0 active:text-primary-foreground p-1.5 rounded-full',
                  'text-muted-foreground cursor-pointer transition-all duration-300',
                  recordingButtonClassName,
                )}
                onSpeechToggle={onSpeechToggle}
                speechEnabled={speechEnabled}
              >
                <Mic
                  size={15}
                  className="transition-all duration-300 [&>svg]:stroke-[1px] [&>svg]:stroke-foreground"
                />
              </SpeechButton>

              {/* Send / Stop toggle: show Stop only when pending + empty input */}
              {isUserRequestPending && !rest.value ? (
                <StopButton
                  className={recordingButtonClassName}
                  onStop={() => onStopStreaming?.()}
                />
              ) : (
                <SendButton onSendClick={onSendClick} disabled={!rest.value} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
