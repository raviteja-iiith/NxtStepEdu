'use client';

import { useRef, useState, useEffect, ReactElement, cloneElement } from 'react';

interface Props {
  children: ReactElement<any>;
  height: number | string;
}

export function ChartWrapper({ children, height }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(0);

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Initial exact measurement
    const initialWidth = containerRef.current.getBoundingClientRect().width;
    if (initialWidth > 0) {
      setWidth(initialWidth);
    }

    // Fallback for some webviews where ResizeObserver is wonky
    const handleResize = () => {
      if (containerRef.current) {
        const newWidth = containerRef.current.getBoundingClientRect().width;
        if (newWidth > 0) setWidth(newWidth);
      }
    };

    window.addEventListener('resize', handleResize);
    
    // Try ResizeObserver as well
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(entries => {
        for (let entry of entries) {
          if (entry.contentRect.width > 0) {
            setWidth(entry.contentRect.width);
          }
        }
      });
      observer.observe(containerRef.current);
    }

    // Force a recount after mount for Capacitor webviews
    const timeout = setTimeout(handleResize, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (observer) observer.disconnect();
      clearTimeout(timeout);
    };
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height, position: 'relative' }}>
      {width > 0 ? (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          {cloneElement(children, { width, height: typeof height === 'number' ? height : undefined })}
        </div>
      ) : null}
    </div>
  );
}
