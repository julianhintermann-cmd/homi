import { useEffect, useState, type RefObject } from 'react';
import { useScrollContainer } from '@/hooks/useScrollMemory';

/**
 * `true` once the screen's scroll container (or the window for screens outside the
 * navigation stack) is scrolled more than `threshold` px. Only re-renders when the boolean
 * flips; the listener is passive and does not read layout.
 */
export function useScrolled(threshold = 2): boolean {
  const container = useScrollContainer();
  return useScrolledIn(container, threshold);
}

export function useScrolledIn(container: RefObject<HTMLElement | null> | null, threshold = 2): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const element = container?.current ?? null;
    const read = (): number => (element ? element.scrollTop : window.scrollY);
    const target: HTMLElement | Window = element ?? window;
    let frame = 0;
    const onScroll = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setScrolled(read() > threshold));
    };
    onScroll();
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      target.removeEventListener('scroll', onScroll);
    };
  }, [container, threshold]);

  return scrolled;
}
