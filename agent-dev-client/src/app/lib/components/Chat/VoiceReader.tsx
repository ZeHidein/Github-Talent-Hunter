import { type FC, Fragment, useEffect, useRef } from 'react';
import { useGlobalAudioPlayer } from 'react-use-audio-player';

import { useMessagingStore, usePrevious } from '@/app/lib/hooks';
import { isSafari } from '@/app/lib/utils';
import { trpc } from '@/app/lib/trpc';

type VoiceReaderProps = {};

const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export const VoiceReader: FC<VoiceReaderProps> = () => {
  const { load, pause, play } = useGlobalAudioPlayer();
  const { speechEnabled, lastVoiceText, isRecordingAudio } = useMessagingStore();

  const prevLastVoiceText = usePrevious(lastVoiceText);
  const prevSpeechEnabled = usePrevious(speechEnabled);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const lastVoiceTextChanged = lastVoiceText !== prevLastVoiceText;
    const speechEnabledBecameTrue = speechEnabled && !prevSpeechEnabled;

    console.log('lastVoiceText', lastVoiceText);

    if (
      lastVoiceText &&
      speechEnabled &&
      !isRecordingAudio &&
      (lastVoiceTextChanged || speechEnabledBecameTrue)
    ) {
      // Revoke previous blob URL to avoid memory leaks
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }

      trpc.platform.textToVoice
        .mutate({ text: lastVoiceText })
        .then(({ data }) => {
          const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
          const blob = new Blob([bytes], { type: 'audio/mpeg' });
          const blobUrl = URL.createObjectURL(blob);
          blobUrlRef.current = blobUrl;
          load(blobUrl, {
            autoplay: true,
            html5: !isSafari(),
            format: 'mp3',
          });
        })
        .catch((err) => {
          console.error('[VoiceReader] Failed to fetch audio:', err);
        });
    }
  }, [
    lastVoiceText,
    prevLastVoiceText,
    speechEnabled,
    prevSpeechEnabled,
    isRecordingAudio,
    load,
    play,
  ]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!speechEnabled && prevSpeechEnabled) {
      load(SILENT_WAV, {
        format: 'wav',
      });
      pause();
    }
  }, [speechEnabled, prevSpeechEnabled, load, pause]);

  useEffect(() => {
    if (isRecordingAudio) {
      pause();
    }
  }, [isRecordingAudio, pause]);

  return <Fragment />;
};
