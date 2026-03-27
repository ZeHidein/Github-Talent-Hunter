import { useState, useEffect } from 'react';
import { isMobile } from '@/app/lib/utils/browser';

/**
 * React hook that detects if the current device is mobile
 * Updates on window resize and orientation change
 * @returns boolean indicating if the device is mobile
 */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState<boolean>(() => isMobile());

  useEffect(() => {
    const handleResize = () => {
      setMobile(isMobile());
    };

    // Listen to resize events
    window.addEventListener('resize', handleResize);

    // Listen to orientation change (important for mobile devices)
    window.addEventListener('orientationchange', handleResize);

    // Initial check
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return mobile;
}
