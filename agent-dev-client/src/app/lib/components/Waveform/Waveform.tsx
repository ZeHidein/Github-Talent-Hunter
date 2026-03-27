import React, { forwardRef } from 'react';

type WaveformSVGProps = {
  className?: string;
  width: number;
  height: number;
  path?: string;
};

export const Waveform = forwardRef<SVGPathElement, WaveformSVGProps>(
  ({ className, width, height, path }, ref) => {
    return (
      <svg width={width} height={height} className={className} aria-hidden="true">
        <path
          ref={ref}
          d={path || ''}
          fill="none"
          strokeWidth="2"
          className="stroke-primary stroke-1"
        />
      </svg>
    );
  },
);

Waveform.displayName = 'Waveform';

export default Waveform;
