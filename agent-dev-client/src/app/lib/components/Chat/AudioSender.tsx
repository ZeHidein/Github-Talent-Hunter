import type React from 'react';
import { useEffect } from 'react';
import { convertBlobToBase64 } from '../../utils';
import { useAudioRecorderContext } from '../../contexts';

type AudioSenderProps = {
  onRecord(base64: string): void;
};

export const AudioSender: React.FC<AudioSenderProps> = ({ onRecord }) => {
  const { subscribeToComplete } = useAudioRecorderContext();

  useEffect(() => {
    const handleRecordingComplete = async (blob: Blob) => {
      if (onRecord) {
        const base64Str = await convertBlobToBase64(blob);
        onRecord(base64Str);
      }
    };

    const unsubscribe = subscribeToComplete(handleRecordingComplete);
    return () => {
      unsubscribe();
    };
  }, [subscribeToComplete, onRecord]);

  return null;
};
