import type React from 'react';
import { useEffect, useRef } from 'react';
import { useGlobalAudioPlayer } from 'react-use-audio-player';
import { RecordingButton } from '@/app/lib/components';
import { useAudioRecorderContext } from '@/app/lib/contexts';
import { useMessagingStore } from '@/app/lib/hooks/useMessagingStore';
import { observer } from 'mobx-react-lite';

type RecordingPanelProps = {
  isUserRequestPending: boolean;
  onRecord?(base64: string): void;
};

export const RecordingPanelComponent: React.FC<RecordingPanelProps> = observer(
  ({ isUserRequestPending }) => {
    const { isRecording, isPending, startRecording, stopRecording } = useAudioRecorderContext();

    const { pause, playing, isLoading: loading } = useGlobalAudioPlayer();
    const { toggleRecordingAudio } = useMessagingStore();

    const prevIsRecording = useRef<boolean>(false);

    useEffect(() => {
      if (!prevIsRecording.current && isRecording) {
        toggleRecordingAudio(true);
      } else if (prevIsRecording.current && !isRecording) {
        toggleRecordingAudio(false);
      }
      prevIsRecording.current = isRecording;
    }, [isRecording, toggleRecordingAudio]);

    const handleToggleRecording = () => {
      if (isRecording || isPending) {
        stopRecording();
      } else {
        if (playing) {
          pause();
        }
        startRecording();
      }
    };

    return (
      <RecordingButton
        isLoading={isUserRequestPending || loading}
        isPlaying={playing}
        onClick={handleToggleRecording}
      />
    );
  },
);
