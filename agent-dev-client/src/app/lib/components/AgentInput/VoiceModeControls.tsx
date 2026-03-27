import type { FC } from 'react';
import { X } from 'lucide-react';
import { useGlobalAudioPlayer } from 'react-use-audio-player';
import { RecordingButton } from '@/app/lib/components';
import { useAudioRecorderContext } from '@/app/lib/contexts';
import { useMessagingStore } from '@/app/lib/hooks/useMessagingStore';
import { observer } from 'mobx-react-lite';

type VoiceModeControlsProps = {
  isUserRequestPending: boolean;
  onCancel: () => void;
};

export const VoiceModeControls: FC<VoiceModeControlsProps> = observer(function VoiceModeControls({
  isUserRequestPending,
  onCancel,
}) {
  const { isRecording, isPending, startRecording, stopRecording } = useAudioRecorderContext();
  const { pause, playing, isLoading: loading } = useGlobalAudioPlayer();
  const { toggleRecordingAudio } = useMessagingStore();

  const handleToggleRecording = () => {
    if (isRecording || isPending) {
      toggleRecordingAudio(false);
      stopRecording();
    } else {
      if (playing) {
        pause();
      }
      toggleRecordingAudio(true);
      startRecording();
    }
  };

  const handleCancel = () => {
    if (isRecording || isPending) {
      toggleRecordingAudio(false);
      stopRecording();
    }
    onCancel();
  };

  return (
    <div className="flex items-center gap-1 sm:gap-2 pointer-events-auto">
      <RecordingButton
        isLoading={isUserRequestPending || loading}
        isPlaying={playing}
        onClick={handleToggleRecording}
      />
      <button
        type="button"
        onClick={handleCancel}
        className="w-[42px] h-[42px] min-w-[42px] min-h-[42px] rounded-full flex-center transition-all duration-300 shadow-lg flex-shrink-0 relative"
        title="Exit voice mode"
      >
        <div className="absolute-inset-overlay bg-muted-foreground hover:bg-muted-foreground/70 rounded-full transition-colors" />
        <X size={20} className="text-background relative z-10" strokeWidth={2.5} />
      </button>
    </div>
  );
});
