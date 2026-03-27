export function isSafari(): boolean {
  const ua = navigator.userAgent || '';
  const vendor = navigator.vendor || '';
  return (
    vendor.includes('Apple') &&
    !ua.includes('CriOS') && // Exclude Chrome on iOS
    !ua.includes('FxiOS') // Exclude Firefox on iOS
  );
}

export function isMobile(): boolean {
  // Method 1: Check touch points (most reliable for modern devices)
  if (typeof navigator.maxTouchPoints !== 'undefined') {
    // Devices with touch support and coarse pointer are typically mobile
    const hasTouch = navigator.maxTouchPoints > 0;
    const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches;

    if (hasTouch && hasCoarsePointer) {
      return true;
    }
  }

  // Method 2: Check screen size (common mobile breakpoint)
  const hasSmallScreen = window.matchMedia?.('(max-width: 768px)')?.matches;
  if (hasSmallScreen) {
    return true;
  }

  // Method 3: User-agent fallback for older browsers/devices
  const ua = navigator.userAgent || '';
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return true;
  }

  return false;
}

export function isSafariMobile(): boolean {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const isIOSDevice = /iPad|iPhone|iPod/.test(ua);
  const isIPadOS13 = platform === 'MacIntel' && navigator.maxTouchPoints > 1;

  return isSafari() && (isIOSDevice || isIPadOS13);
}
