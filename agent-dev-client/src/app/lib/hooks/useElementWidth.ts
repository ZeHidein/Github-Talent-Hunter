import { useState, useEffect, useRef, type MutableRefObject } from 'react';

export function useElementWidth() {
  const ref = useRef<any>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current as any;
    if (!element) {
      return;
    }

    // Function to update width state
    const updateWidth = (entries: any) => {
      const entry = entries[0];
      if (entry) {
        setWidth(entry.contentRect.width);
      }
    };

    // Create a ResizeObserver instance
    const resizeObserver = new ResizeObserver(updateWidth);

    // Start observing the element
    resizeObserver.observe(element);

    // Set initial width
    setWidth(element.getBoundingClientRect().width);

    // Cleanup function to unobserve the element
    return () => {
      if (resizeObserver && element) {
        resizeObserver.unobserve(element);
        resizeObserver.disconnect();
      }
    };
  }, []);

  return [ref, width] as [MutableRefObject<HTMLDivElement>, number];
}

export default useElementWidth;
