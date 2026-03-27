import { useRef, useState, useCallback, useMemo } from 'react';

import type RecordRTCClassDefinition from 'recordrtc'; // Type for the RecordRTC class/constructor
import type {
  StereoAudioRecorder as StereoAudioRecorderClassDefinition,
  Options as RecordRTCOptions,
} from 'recordrtc'; // Types for StereoAudioRecorder class/constructor and Options

import { AudioVolumeMeter } from '../services/volume-meter';

type UseAudioRecorderProps = {
  onRecordingStarted?(): void;
  recordingInterval?: number;
  maxRecordingDuration?: number;
};

function ensureAudioContext(
  audioContextRef: React.MutableRefObject<AudioContext | null>,
): AudioContext | null {
  if (!audioContextRef.current) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioContextRef.current = new AudioContextClass();
    }
  }
  return audioContextRef.current;
}

export const useAudioRecorder = ({
  recordingInterval = 60,
  maxRecordingDuration = 30,
}: UseAudioRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isMicEnabled, setIsMicEnabled] = useState(false);

  const recorderRef = useRef<InstanceType<typeof RecordRTCClassDefinition> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundMeterRef = useRef<AudioVolumeMeter | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const libraryModuleRef = useRef<{
    default: typeof RecordRTCClassDefinition;
    StereoAudioRecorder: typeof StereoAudioRecorderClassDefinition;
  } | null>(null);

  // Manage progress subscribers
  const progressSubscribers = useRef<Set<(audioBuffer: AudioBuffer, volume: number) => void>>(
    new Set(),
  );
  const subscribeToProgress = useCallback(
    (callback: (audioBuffer: AudioBuffer, volume: number) => void) => {
      progressSubscribers.current.add(callback);
      return () => {
        progressSubscribers.current.delete(callback);
      };
    },
    [],
  );

  // Manage completion subscribers
  const completionSubscribers = useRef<Set<(blob: Blob) => void>>(new Set());
  const subscribeToComplete = useCallback((callback: (blob: Blob) => void) => {
    completionSubscribers.current.add(callback);
    return () => {
      completionSubscribers.current.delete(callback);
    };
  }, []);

  const loadRecordRTCLibrary = useCallback(async () => {
    if (!libraryModuleRef.current) {
      const lib = await import('recordrtc');
      libraryModuleRef.current = lib;
    }
    return libraryModuleRef.current;
  }, []);

  // Method to enable the microphone and obtain the media stream
  const enableMicrophone = useCallback(() => {
    if (streamRef.current) {
      // Microphone is already enabled
      return Promise.resolve();
    }

    setIsPending(true);

    // Create AudioContext if not already created
    ensureAudioContext(audioContextRef);

    const audioContext = audioContextRef.current;

    if (!audioContext) {
      setIsPending(false);
      console.error('AudioContext is not supported in this browser.');
      return Promise.reject(new Error('AudioContext is not supported in this browser.'));
    }

    return navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        streamRef.current = stream;

        // Create and connect the volume meter to the stream
        if (!soundMeterRef.current) {
          soundMeterRef.current = new AudioVolumeMeter(audioContext);
        }
        soundMeterRef.current.connectToSource(stream);

        setIsPending(false);
        setIsMicEnabled(true);
      })
      .catch((error) => {
        console.error('Error accessing microphone:', error);
        setIsPending(false);
        throw error;
      });
  }, []);

  // Method to disable the microphone and release resources
  const disableMicrophone = useCallback(() => {
    // Always clear any active recording timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop the media stream
    if (recorderRef.current) {
      // Stop without invoking completion subscribers (cancel semantics)
      recorderRef.current.stopRecording();
      recorderRef.current = null;
    }

    // Ensure UI state reflects that we are no longer recording/pending
    setIsRecording(false);
    setIsPending(false);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }

    // Stop the volume meter
    if (soundMeterRef.current) {
      soundMeterRef.current.stop();
      soundMeterRef.current = null;
    }

    // Close the audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setIsMicEnabled(false);
  }, []);

  const handleDataAvailable = useCallback((blob: Blob) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // Ensure audio context is available
      const audioContext = ensureAudioContext(audioContextRef);
      if (!audioContext) {
        console.error('AudioContext is not supported in this browser.');
        return;
      }

      const arrayBuffer = reader.result as ArrayBuffer;
      const volume = soundMeterRef.current ? soundMeterRef.current.getVolume() : 0;

      audioContext
        .decodeAudioData(arrayBuffer)
        .then((audioBuffer) => {
          // Notify all progress subscribers
          progressSubscribers.current.forEach((callback) => {
            callback(audioBuffer, volume);
          });
        })
        .catch((error) => {
          console.error('Error decoding audio data:', error);
        });
    };
    reader.readAsArrayBuffer(blob);
  }, []);

  // Method to start recording
  const startRecording = useCallback(async () => {
    if (!streamRef.current) {
      console.error('Microphone is not enabled. Please call enableMicrophone() first.');
      return;
    }

    // Ensure audio context is available
    const audioContext = ensureAudioContext(audioContextRef);
    if (!audioContext) {
      console.error('AudioContext is not supported in this browser.');
      return;
    }

    const lib = await loadRecordRTCLibrary();
    setIsPending(false); // Clear pending after loading

    if (!lib) {
      console.error('Failed to load RecordRTC library.');
      return;
    }
    const RecordRTCConstructor = lib.default;
    const RecorderType = lib.StereoAudioRecorder;

    setIsRecording(true);
    setRecordingTime(0);

    const options = {
      type: 'audio',
      mimeType: 'audio/wav',
      numberOfAudioChannels: 1,
      desiredSampRate: 41000,
      recorderType: RecorderType,
      timeSlice: recordingInterval,
      ondataavailable: handleDataAvailable,
    } as RecordRTCOptions;

    const recorder = new RecordRTCConstructor(streamRef.current, options);
    recorderRef.current = recorder;
    recorder.startRecording();

    // Start timer for max recording duration
    timerRef.current = setInterval(() => {
      setRecordingTime((prevTime) => {
        if (prevTime >= maxRecordingDuration - 1) {
          stopRecording();
          return maxRecordingDuration;
        }
        return prevTime + 1;
      });
    }, 1000);
  }, [recordingInterval, maxRecordingDuration, handleDataAvailable, loadRecordRTCLibrary]);

  // Method to stop recording
  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (recorderRef.current) {
      recorderRef.current.stopRecording(() => {
        const blob = recorderRef.current!.getBlob();

        // Notify all completion subscribers
        completionSubscribers.current.forEach((callback) => {
          callback(blob);
        });

        recorderRef.current = null;
        setIsRecording(false);
      });
    }
  }, []);

  const value = useMemo(
    () => ({
      isRecording,
      isPending,
      isMicEnabled,
      enableMicrophone,
      disableMicrophone,
      startRecording,
      stopRecording,
      subscribeToProgress,
      subscribeToComplete,
    }),
    [
      isRecording,
      isPending,
      isMicEnabled,
      enableMicrophone,
      disableMicrophone,
      startRecording,
      stopRecording,
      subscribeToProgress,
      subscribeToComplete,
    ],
  );

  return value;
};
