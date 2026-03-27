import type { FC } from 'react';
import { Mic, Volume2 } from 'lucide-react';
import { cn } from '@/app/lib/utils';

type AISpeakingIndicatorProps = {
  isAISpeaking: boolean;
  isPending: boolean;
  isRecording: boolean;
};

export const AISpeakingIndicator: FC<AISpeakingIndicatorProps> = ({
  isAISpeaking,
  isPending,
  isRecording,
}) => {
  const getStatusText = () => {
    if (isAISpeaking) {
      return 'AI Speaking';
    }
    if (isPending) {
      return 'Initializing...';
    }
    if (isRecording) {
      return 'Listening';
    }
    return 'Ready to listen';
  };

  const getIcon = () => {
    if (isAISpeaking) {
      return <Volume2 size={20} className="stroke-muted-foreground shrink-0" />;
    }
    return (
      <Mic
        size={20}
        className={cn(
          'stroke-muted-foreground animate-pulse shrink-0',
          isPending && 'animate-pulse',
        )}
      />
    );
  };

  return (
    <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto h-8">
      {getIcon()}
      <span className="text-sm sm:text-base font-medium text-muted-foreground font-plus-jakarta-sans whitespace-nowrap">
        {getStatusText()}
      </span>
    </div>
  );
};
