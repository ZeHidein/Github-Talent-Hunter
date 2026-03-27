import { type FC, useRef, useEffect } from 'react';
import { useAudioRecorderContext } from '@/app/lib/contexts';

// Amplitude Configuration
// Controls the height/intensity of the waveform
const AMPLITUDE: {
  IDLE: number;
  READY: number;
  ACTIVE_MIN: number;
  ACTIVE_MAX: number;
  HEIGHT_MULTIPLIER: number;
  SMOOTHING_FACTOR: number;
} = {
  // Target amplitudes for different states [Range: 0-1, normalized]
  IDLE: 0.05, // Nearly flat when completely idle [Recommended: 0.01-0.1]
  READY: 0.2, // Small waves when ready but not active [Recommended: 0.1-0.3]
  ACTIVE_MIN: 0.15, // Minimum amplitude when speaking/recording [Recommended: 0.1-0.3]
  ACTIVE_MAX: 0.8, // Maximum amplitude when speaking/recording [Range: 0-1, Recommended: 0.7-1.0]

  // Visual scaling [Range: 0-1, normalized to canvas height]
  HEIGHT_MULTIPLIER: 0.2, // Wave height as fraction of canvas [Recommended: 0.15-0.3]

  // Controls how fast amplitude responds to volume changes
  // Too low (0.05): laggy, disconnected feeling
  // Too high (0.8): twitchy, jittery
  SMOOTHING_FACTOR: 0.4, // [Recommended: 0.15-0.5]
};

// Animation Speed Configuration
// Controls how fast the wave moves horizontally [Range: 0-1+, arbitrary units]
// Higher = faster scrolling motion
const ANIMATION_SPEED = {
  IDLE: 0.02, // Slow drift when idle [Recommended: 0.01-0.05]
  ACTIVE_RECORDING: 0.12, // Speed when user is recording [Recommended: 0.05-0.15]
  AI_SPEAKING: 0.12, // Faster movement when AI is speaking [Recommended: 0.1-0.3]
};

// Wave Shape Configuration
// Multiple sine waves are layered together to create organic, natural-looking movement
const WAVE_SHAPE = {
  // Base wave properties [Range: 0.001-0.1, arbitrary frequency units]
  FREQUENCY: 0.02, // Base wave frequency [Recommended: 0.01-0.05]
  // Lower = wider/slower waves, Higher = tighter/faster waves

  // Amplitude contribution from each wave layer [Range: 0-1, should sum close to 1.0]
  // These control how much each wave type affects the final shape
  PRIMARY_WAVE: 0.6, // Main wave - base movement [Recommended: 0.5-0.7]
  HARMONIC_WAVE: 0.22, // Fast detail layer - adds texture [Recommended: 0.15-0.3]
  SUB_WAVE: 0.18, // Slow depth layer - adds bass feel [Recommended: 0.1-0.25]

  // Frequency multipliers [Range: 0.1-10, relative to base frequency]
  // Control how fast/slow secondary waves oscillate compared to primary
  HARMONIC_FREQ_MULT: 2.3, // Harmonic frequency [Recommended: 1.5-3.0] (higher = tighter ripples)
  SUB_FREQ_MULT: 0.7, // Sub-wave frequency [Recommended: 0.3-0.9] (lower = broader undulation)

  // Speed multipliers [Range: 0.1-3.0, relative to animation speed]
  // Control how fast secondary waves travel compared to primary
  HARMONIC_SPEED_MULT: 1.2, // Harmonic travel speed [Recommended: 1.0-2.0]
  SUB_SPEED_MULT: 0.8, // Sub-wave travel speed [Recommended: 0.5-1.0]
};

// Visual Styling Configuration
const VISUAL = {
  // Wave positioning [Range: 0-1, normalized to canvas height]
  VERTICAL_POSITION: 0.25, // Vertical position on canvas [Recommended: 0.2-0.4]
  // 0 = top, 0.5 = middle, 1 = bottom

  // Line styling [Range: 1-10 pixels]
  LINE_WIDTH: 4.5, // Thickness of wave line [Recommended: 3-6]

  // Edge tapering [Range: 0-0.5, normalized to canvas width]
  TAPER_WIDTH_PERCENT: 0.15, // Width of fade zone on each edge [Recommended: 0.1-0.25]
  // 0.15 = 15% fade on left and right sides

  // Rendering quality [Integer values]
  CURVE_STEPS_DIVISOR: 2, // Curve point density [Recommended: 2-4]
  // Lower = more points = smoother but slower
  CURVE_STEPS_MAX: 300, // Max calculation points [Recommended: 150-400]
  // Caps performance cost on wide screens

  // Glow effect [Pixel values for blur, normalized for radius]
  GLOW_BLUR_BASE: 20, // Base blur in pixels [Recommended: 15-30]
  GLOW_BLUR_DYNAMIC: 25, // Extra blur when active [Recommended: 15-40]
  GLOW_RADIUS_PERCENT: 0.6, // Glow spread [Range: 0-1, Recommended: 0.4-0.8]

  // Edge fade zones [Range: 0-0.5, normalized to canvas dimensions]
  EDGE_FADE_PERCENT: 0.2, // Horizontal edge fade [Recommended: 0.15-0.3]
  BOTTOM_FADE_START: 0.5, // Where bottom fade begins [Recommended: 0.3-0.7]
  // 0.5 = starts at half amplitude below centerline
};

// Audio Input Configuration
const AUDIO_INPUT = {
  // Microphone sensitivity [Range: 100-1000, multiplier]
  // Raw microphone levels are typically very small (0.001-0.01)
  // This multiplier scales them to usable amplitude range (0-1)
  MIC_SENSITIVITY: 400, // [Recommended: 300-600]
  // Lower = less sensitive, Higher = more reactive

  // AI speaking simulation (when no real audio) [Range: 0-1, normalized]
  AI_SIM_MIN: 0.2, // Min simulated volume [Recommended: 0.1-0.3]
  AI_SIM_MAX: 0.7, // Max simulated volume [Recommended: 0.5-0.9]

  // Simulation timing [Range: 50-500 milliseconds]
  AI_SIM_INTERVAL_MS: 100, // Volume update frequency [Recommended: 80-200]
};

// Color Configuration
// Colors as partial RGBA strings (opacity added dynamically in code)
// Format: 'rgba(R, G, B, ' where R,G,B are 0-255
const COLORS = {
  // User speaking: yellow to green gradient
  USER_LEFT: 'rgba(247, 218, 154, ', // Left side: warm yellow #F7DA9A
  USER_RIGHT: 'rgba(181, 229, 127, ', // Right side: fresh green #B5E57F
  USER_GLOW: 'rgba(214, 223, 140, ', // Glow: blend of yellow-green

  // AI speaking: blue theme
  AI_LINE: 'rgba(59, 130, 246, ', // Line color: vibrant blue
  AI_GLOW: 'rgba(59, 130, 246, ', // Glow color: matching blue
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Smooth interpolation helper
const lerp = (start: number, end: number, factor: number) => {
  return start + (end - start) * factor;
};

// Smoothstep interpolation for smooth edge tapering
const smoothstep = (t: number) => {
  return t * t * (3 - 2 * t);
};

// ============================================================================
// COMPONENT
// ============================================================================

type Props = {
  isActive: boolean;
  isListening: boolean;
  isAISpeaking: boolean;
};

/**
 * AdaptiveWaveform - Visualizes audio with smooth amplitude
 * Shows different colors for user speaking (yellow-green gradient) vs AI speaking (blue)
 */
export const AdaptiveWaveform: FC<Props> = ({ isActive, isListening, isAISpeaking }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const volumeRef = useRef<number>(0);
  const smoothedVolumeRef = useRef<number>(AMPLITUDE.ACTIVE_MIN); // Start with minimum active amplitude
  const timeRef = useRef<number>(0);

  const { subscribeToProgress, isRecording } = useAudioRecorderContext();

  // Color schemes: yellow to green gradient for user speaking, blue for AI speaking
  const colors = isListening
    ? {
        leftColor: COLORS.USER_LEFT,
        rightColor: COLORS.USER_RIGHT,
        glow: COLORS.USER_GLOW,
      }
    : {
        line: COLORS.AI_LINE,
        glow: COLORS.AI_GLOW,
      };

  // Subscribe to real microphone volume when recording
  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const handleProgress = (_audioBuffer: AudioBuffer, level: number) => {
      // Scale microphone input based on sensitivity setting
      const scaledLevel = Math.min(level * AUDIO_INPUT.MIC_SENSITIVITY, 1.0);
      volumeRef.current = scaledLevel;
    };

    const unsubscribeProgress = subscribeToProgress(handleProgress);
    return () => {
      unsubscribeProgress();
    };
  }, [subscribeToProgress, isRecording]);

  // Generate simulated volume for AI speaking
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isAISpeaking && !isRecording) {
      // Only simulate when AI is speaking and user is NOT recording
      interval = setInterval(() => {
        const level =
          Math.random() * (AUDIO_INPUT.AI_SIM_MAX - AUDIO_INPUT.AI_SIM_MIN) +
          AUDIO_INPUT.AI_SIM_MIN;
        volumeRef.current = level;
      }, AUDIO_INPUT.AI_SIM_INTERVAL_MS);
    } else if (!isRecording) {
      volumeRef.current = 0;
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isAISpeaking, isRecording]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d', {
      alpha: true,
      desynchronized: true,
    });
    if (!ctx) {
      return;
    }

    let width = 0;
    let height = 0;
    let dpr = 1;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const drawWave = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Position waveform vertically on canvas
      const centerY = height * VISUAL.VERTICAL_POSITION;

      // Determine target amplitude (0-1 range) based on current state
      let targetAmplitude: number = AMPLITUDE.IDLE;

      if ((isRecording || isAISpeaking) && volumeRef.current > 0) {
        // Active state: clamp volume between min and max
        targetAmplitude = Math.min(
          Math.max(volumeRef.current, AMPLITUDE.ACTIVE_MIN),
          AMPLITUDE.ACTIVE_MAX,
        );
      } else {
        // Ready state: show small idle waves
        targetAmplitude = AMPLITUDE.READY;
      }

      // Smooth amplitude transitions using lerp
      smoothedVolumeRef.current = lerp(
        smoothedVolumeRef.current,
        targetAmplitude,
        AMPLITUDE.SMOOTHING_FACTOR,
      );

      // Calculate actual pixel amplitude from normalized value
      const amplitude = height * AMPLITUDE.HEIGHT_MULTIPLIER * smoothedVolumeRef.current;

      // Wave properties
      const frequency = WAVE_SHAPE.FREQUENCY;
      // Priority: Recording > AI Speaking > Active > Idle
      const speed = isRecording
        ? ANIMATION_SPEED.ACTIVE_RECORDING
        : isAISpeaking
          ? ANIMATION_SPEED.AI_SPEAKING
          : isActive
            ? ANIMATION_SPEED.ACTIVE_RECORDING
            : ANIMATION_SPEED.IDLE;

      timeRef.current += speed;
      const time = timeRef.current;

      // Calculate wave taper for smooth edges
      const taperWidth = width * VISUAL.TAPER_WIDTH_PERCENT;
      const steps = Math.min(
        Math.floor(width / VISUAL.CURVE_STEPS_DIVISOR),
        VISUAL.CURVE_STEPS_MAX,
      );
      const stepSize = width / steps;
      const wavePoints: { x: number; y: number }[] = [];

      for (let i = 0; i <= steps; i++) {
        const x = i * stepSize;

        // Calculate taper factor (0 at edges, 1 in middle) with SMOOTHSTEP
        let edgeTaper = 1;
        if (x < taperWidth) {
          // Left edge: smoothstep interpolation for smooth curve
          const t = x / taperWidth;
          edgeTaper = smoothstep(t);
        } else if (x > width - taperWidth) {
          // Right edge: smoothstep interpolation for smooth curve
          const t = (width - x) / taperWidth;
          edgeTaper = smoothstep(t);
        }

        const taperedAmplitude = amplitude * edgeTaper;

        // Combine multiple sine waves for organic movement
        const y =
          centerY +
          Math.sin(x * frequency + time) * taperedAmplitude * WAVE_SHAPE.PRIMARY_WAVE +
          Math.sin(
            x * frequency * WAVE_SHAPE.HARMONIC_FREQ_MULT + time * WAVE_SHAPE.HARMONIC_SPEED_MULT,
          ) *
            taperedAmplitude *
            WAVE_SHAPE.HARMONIC_WAVE +
          Math.sin(x * frequency * WAVE_SHAPE.SUB_FREQ_MULT + time * WAVE_SHAPE.SUB_SPEED_MULT) *
            taperedAmplitude *
            WAVE_SHAPE.SUB_WAVE;

        wavePoints.push({ x, y });
      }

      // Helper function to draw smooth curve through points
      const drawSmoothCurve = () => {
        ctx.moveTo(wavePoints[0].x, wavePoints[0].y);

        // Draw curves through points using each point as control point
        for (let i = 0; i < wavePoints.length - 2; i++) {
          const xc = (wavePoints[i].x + wavePoints[i + 1].x) / 2;
          const yc = (wavePoints[i].y + wavePoints[i + 1].y) / 2;
          ctx.quadraticCurveTo(wavePoints[i].x, wavePoints[i].y, xc, yc);
        }

        // Draw final segment to last point
        const lastIdx = wavePoints.length - 1;
        ctx.quadraticCurveTo(
          wavePoints[lastIdx - 1].x,
          wavePoints[lastIdx - 1].y,
          wavePoints[lastIdx].x,
          wavePoints[lastIdx].y,
        );
      };

      // Draw glow layer - MAXIMUM OPACITY
      ctx.save();
      ctx.beginPath();
      drawSmoothCurve();

      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();

      const currentAmplitude = smoothedVolumeRef.current;
      const blurAmount = VISUAL.GLOW_BLUR_BASE + currentAmplitude * VISUAL.GLOW_BLUR_DYNAMIC;
      ctx.filter = `blur(${blurAmount}px)`;

      const glowGradient = ctx.createRadialGradient(
        width / 2,
        centerY,
        0,
        width / 2,
        centerY,
        width * VISUAL.GLOW_RADIUS_PERCENT,
      );

      const glowColor = isListening ? colors.glow : colors.glow;
      // MAXIMUM opacity values - much more visible glow
      glowGradient.addColorStop(0, `${glowColor}${0.95 + currentAmplitude * 0.05})`);
      glowGradient.addColorStop(0.4, `${glowColor}${0.75 + currentAmplitude * 0.2})`);
      glowGradient.addColorStop(0.7, `${glowColor}0.45)`);
      glowGradient.addColorStop(1, `${glowColor}0.1)`);

      ctx.fillStyle = glowGradient;
      ctx.fill();

      ctx.restore();

      // Draw wave line with smooth curves - 100% OPACITY THROUGHOUT
      ctx.save();
      ctx.filter = 'none';
      ctx.beginPath();
      drawSmoothCurve();

      const lineGradient = ctx.createLinearGradient(0, 0, width, 0);

      if (isListening) {
        // Yellow to green gradient for user speaking - 100% OPACITY
        lineGradient.addColorStop(0, `${colors.leftColor}1)`);
        lineGradient.addColorStop(0.15, `${colors.leftColor}1)`);
        lineGradient.addColorStop(0.25, `${colors.leftColor}1)`);
        lineGradient.addColorStop(0.4, `${colors.leftColor}1)`);
        lineGradient.addColorStop(0.5, 'rgba(214, 223, 140, 1)'); // Blend in the middle
        lineGradient.addColorStop(0.6, `${colors.rightColor}1)`);
        lineGradient.addColorStop(0.75, `${colors.rightColor}1)`);
        lineGradient.addColorStop(0.85, `${colors.rightColor}1)`);
        lineGradient.addColorStop(1, `${colors.rightColor}1)`);
      } else {
        // Blue for AI speaking - 100% OPACITY
        lineGradient.addColorStop(0, `${colors.line}1)`);
        lineGradient.addColorStop(0.15, `${colors.line}1)`);
        lineGradient.addColorStop(0.25, `${colors.line}1)`);
        lineGradient.addColorStop(0.5, `${colors.line}1)`);
        lineGradient.addColorStop(0.75, `${colors.line}1)`);
        lineGradient.addColorStop(0.85, `${colors.line}1)`);
        lineGradient.addColorStop(1, `${colors.line}1)`);
      }

      ctx.strokeStyle = lineGradient;
      ctx.lineWidth = VISUAL.LINE_WIDTH;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Edge fades - using destination-out for proper transparency
      ctx.globalCompositeOperation = 'destination-out';

      // Left fade
      const leftFadeWidth = width * VISUAL.EDGE_FADE_PERCENT;
      const leftFade = ctx.createLinearGradient(0, 0, leftFadeWidth, 0);
      leftFade.addColorStop(0, 'rgba(0, 0, 0, 1)'); // Fully transparent at edge
      leftFade.addColorStop(0.3, 'rgba(0, 0, 0, 0.7)');
      leftFade.addColorStop(0.6, 'rgba(0, 0, 0, 0.4)');
      leftFade.addColorStop(1, 'rgba(0, 0, 0, 0)'); // Fully visible
      ctx.fillStyle = leftFade;
      ctx.fillRect(0, 0, leftFadeWidth, height);

      // Right fade
      const rightFadeStart = width * (1 - VISUAL.EDGE_FADE_PERCENT);
      const rightFade = ctx.createLinearGradient(rightFadeStart, 0, width, 0);
      rightFade.addColorStop(0, 'rgba(0, 0, 0, 0)'); // Fully visible
      rightFade.addColorStop(0.4, 'rgba(0, 0, 0, 0.4)');
      rightFade.addColorStop(0.7, 'rgba(0, 0, 0, 0.7)');
      rightFade.addColorStop(1, 'rgba(0, 0, 0, 1)'); // Fully transparent at edge
      ctx.fillStyle = rightFade;
      ctx.fillRect(rightFadeStart, 0, width * VISUAL.EDGE_FADE_PERCENT, height);

      // Bottom fade
      const bottomFadeStart = centerY + amplitude * VISUAL.BOTTOM_FADE_START;
      const bottomFade = ctx.createLinearGradient(0, bottomFadeStart, 0, height);
      bottomFade.addColorStop(0, 'rgba(0, 0, 0, 0)');
      bottomFade.addColorStop(0.3, 'rgba(0, 0, 0, 0.2)');
      bottomFade.addColorStop(0.6, 'rgba(0, 0, 0, 0.5)');
      bottomFade.addColorStop(0.85, 'rgba(0, 0, 0, 0.8)');
      bottomFade.addColorStop(1, 'rgba(0, 0, 0, 1)');
      ctx.fillStyle = bottomFade;
      ctx.fillRect(0, bottomFadeStart, width, height);

      ctx.restore();

      animationRef.current = requestAnimationFrame(drawWave);
    };

    animationRef.current = requestAnimationFrame(drawWave);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, isListening, isAISpeaking, isRecording, colors]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full pointer-events-none"
      style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
};
