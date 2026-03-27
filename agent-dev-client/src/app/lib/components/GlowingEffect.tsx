import type React from 'react';
import { useEffect, useRef, useState } from 'react';

interface GlowingEffectProps {
  spread?: number;
  glow?: boolean;
  disabled?: boolean;
  proximity?: number;
  inactiveZone?: number;
}

export const GlowingEffect: React.FC<GlowingEffectProps> = ({
  spread = 80,
  glow = true,
  disabled = false,
  proximity = 100,
  inactiveZone = 0.01,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    if (disabled) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      setMousePosition({ x, y });
    };

    const handleMouseEnter = () => {
      setIsHovering(true);
    };

    const handleMouseLeave = () => {
      setIsHovering(false);
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseenter', handleMouseEnter);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [disabled]);

  if (disabled) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        borderRadius: 'inherit',
        background:
          isHovering && glow
            ? `radial-gradient(${spread}px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(59, 130, 246, 0.2), rgba(147, 197, 253, 0.1) 40%, transparent 70%)`
            : 'transparent',
      }}
    >
      {/* Main glowing dot */}
      {isHovering && (
        <div
          className="absolute rounded-full bg-blue-400 opacity-80 transition-all duration-100"
          style={{
            left: mousePosition.x - 6,
            top: mousePosition.y - 6,
            width: '12px',
            height: '12px',
            boxShadow:
              '0 0 20px rgba(59, 130, 246, 0.8), 0 0 40px rgba(59, 130, 246, 0.6), 0 0 60px rgba(59, 130, 246, 0.4)',
            filter: 'blur(0.5px)',
          }}
        />
      )}

      {/* Sparkling particles */}
      {isHovering && (
        <>
          <div
            className="absolute rounded-full bg-white opacity-90 animate-pulse"
            style={{
              left: mousePosition.x + 25,
              top: mousePosition.y - 15,
              width: '4px',
              height: '4px',
              animationDelay: '0ms',
              animationDuration: '1s',
            }}
          />
          <div
            className="absolute rounded-full bg-blue-300 opacity-80 animate-pulse"
            style={{
              left: mousePosition.x - 20,
              top: mousePosition.y + 20,
              width: '3px',
              height: '3px',
              animationDelay: '300ms',
              animationDuration: '1.2s',
            }}
          />
          <div
            className="absolute rounded-full bg-white opacity-70 animate-pulse"
            style={{
              left: mousePosition.x + 15,
              top: mousePosition.y + 30,
              width: '2px',
              height: '2px',
              animationDelay: '600ms',
              animationDuration: '0.8s',
            }}
          />
          <div
            className="absolute rounded-full bg-blue-200 opacity-60 animate-pulse"
            style={{
              left: mousePosition.x - 30,
              top: mousePosition.y - 10,
              width: '2px',
              height: '2px',
              animationDelay: '900ms',
              animationDuration: '1.5s',
            }}
          />
          <div
            className="absolute rounded-full bg-cyan-300 opacity-75 animate-pulse"
            style={{
              left: mousePosition.x + 35,
              top: mousePosition.y + 10,
              width: '3px',
              height: '3px',
              animationDelay: '150ms',
              animationDuration: '1.1s',
            }}
          />
          <div
            className="absolute rounded-full bg-blue-100 opacity-50 animate-pulse"
            style={{
              left: mousePosition.x - 10,
              top: mousePosition.y - 25,
              width: '2px',
              height: '2px',
              animationDelay: '450ms',
              animationDuration: '0.9s',
            }}
          />
        </>
      )}
    </div>
  );
};
