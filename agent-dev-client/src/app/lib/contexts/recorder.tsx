import type React from 'react';
import { createContext, useContext } from 'react';
import { useAudioRecorder } from '@/app/lib/hooks';

type AudioRecorderContextType = ReturnType<typeof useAudioRecorder>;

const AudioRecorderContext = createContext<AudioRecorderContextType | undefined>(undefined);

export const AudioRecorderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const audioRecorder = useAudioRecorder({
    recordingInterval: 600,
  });

  return (
    <AudioRecorderContext.Provider value={audioRecorder}>{children}</AudioRecorderContext.Provider>
  );
};

export const useAudioRecorderContext = () => {
  const context = useContext(AudioRecorderContext);
  if (context === undefined) {
    throw new Error('useAudioRecorderContext must be used within an AudioRecorderProvider');
  }
  return context;
};
