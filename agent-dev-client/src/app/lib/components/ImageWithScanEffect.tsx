import type React from 'react';
import { useState, useEffect, Fragment } from 'react';

type ImageWithScanEffectProps = {
  src: string;
  alt?: string;
};

export const ImageWithScanEffectComponent: React.FC<ImageWithScanEffectProps> = ({ src, alt }) => {
  const [showScanEffect, setShowScanEffect] = useState(true);

  useEffect(() => {
    // Always show effect on mount, hide after animation completes
    const timer = setTimeout(() => {
      setShowScanEffect(false);
    }, 1500); // Match animation duration
    return () => clearTimeout(timer);
  }, [src]);

  return (
    <Fragment>
      <img
        className="object-center object-contain mx-auto rounded-md hover:opacity-90 transition-opacity w-full"
        src={src}
        alt={alt}
        style={{
          clipPath: showScanEffect ? 'inset(0 0 100% 0)' : 'none',
          animation: showScanEffect ? 'imageReveal 1.5s ease-out forwards' : 'none',
        }}
      />
      {showScanEffect && (
        <div
          className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent"
          style={{
            animation: 'scanLine 1.5s ease-out forwards',
            boxShadow: '0 0 15px hsl(var(--primary) / 0.9)',
          }}
        />
      )}
      <style>{`
        @keyframes imageReveal {
          0% {
            clip-path: inset(0 0 100% 0);
          }
          100% {
            clip-path: inset(0 0 0% 0);
          }
        }

        @keyframes scanLine {
          0% {
            top: 0;
            opacity: 1;
          }
          100% {
            top: 100%;
            opacity: 0;
          }
        }
      `}</style>
    </Fragment>
  );
};
