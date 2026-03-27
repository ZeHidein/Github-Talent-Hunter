import type React from 'react';
import { useEffect, useState } from 'react';

import { useElementWidth } from '@/app/lib/hooks';
import { base64ToAudioBuffer, cn } from '@/app/lib/utils';

import { linearPath } from '@/app/lib/utils/waveformPath';
import Waveform from './Waveform';

type WaveformProps = {
  data: string;
} & React.HTMLAttributes<SVGElement>;

export const FileWaveform: React.FC<WaveformProps> = ({ className, data }) => {
  const [ref, width] = useElementWidth();
  const height = 22;
  const [path, setPath] = useState('');

  useEffect(() => {
    const decodeBase64ToAudioBuffer = async () => {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      if (!width) {
        console.debug('width is not set yet');
        return;
      }

      try {
        const decodedAudio = await base64ToAudioBuffer(data, audioContext);
        setPath(
          linearPath(decodedAudio, {
            samples: 100,
            type: 'mirror',
            height,
            width: width as number,
            left: 0,
            top: 0,
            normalize: true,
            animation: false,
            paths: [
              // { d: "Q", sx: 0, sy: 0, x: 50, y: 100, ex: 100, ey: 0 } as any,
              { d: 'V', sy: 0, x: 0, ey: 100 },
            ],
          }),
        );
      } catch (error) {
        console.error('Error decoding audio data:', error);
      }
    };

    if (data) {
      decodeBase64ToAudioBuffer();
    }
  }, [data, width]);

  return (
    <div
      className={cn(
        'w-full overflow-hidden bg-white rounded-lg px-4 p-4 max-w-container-xl mx-auto flex justify-center',
        className,
      )}
    >
      <div className="w-full max-w-[450px]" ref={ref}>
        {path && (
          <Waveform
            className={cn('z-0 bg-transparent m-auto w-full')}
            path={path}
            width={width}
            height={height}
          />
        )}
      </div>
    </div>
  );
};
