import { createContext, useContext, useLayoutEffect, type RefObject } from 'react';

/** Scroll offsets per screen key for the lifetime of the page (not persisted). */
const positions = new Map<string, number>();

/** Gives up restoring when content has not grown tall enough within this time. */
const RESTORE_TIMEOUT_MS = 1_000;

export function getRememberedScroll(key: string): number | undefined {
  return positions.get(key);
}

export function forgetScroll(key: string): void {
  positions.delete(key);
}

/**
 * Remembers the scroll offset of a screen's scroll container and restores it when a screen
 * with the same key mounts again (back navigation, returning to a tab). Content that arrives
 * asynchronously (lazy chunk, query data) is waited for briefly.
 */
export function useScrollMemory(ref: RefObject<HTMLElement | null>, key: string): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const target = positions.get(key) ?? 0;
    let restoring = target > 0;
    let observer: ResizeObserver | null = null;
    let timeout = 0;

    const stopRestoring = (): void => {
      restoring = false;
      observer?.disconnect();
      observer = null;
      window.clearTimeout(timeout);
    };

    const tryRestore = (): void => {
      if (!restoring) return;
      element.scrollTop = target;
      if (Math.abs(element.scrollTop - target) < 1) stopRestoring();
    };

    if (restoring) {
      tryRestore();
      if (restoring && typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(tryRestore);
        for (const child of Array.from(element.children)) observer.observe(child);
        observer.observe(element);
        timeout = window.setTimeout(stopRestoring, RESTORE_TIMEOUT_MS);
      }
    }

    const onScroll = (): void => {
      if (restoring) return;
      positions.set(key, element.scrollTop);
    };
    // A user gesture ends restoration immediately.
    const onUserScroll = (): void => stopRestoring();

    element.addEventListener('scroll', onScroll, { passive: true });
    element.addEventListener('touchstart', onUserScroll, { passive: true });
    element.addEventListener('wheel', onUserScroll, { passive: true });
    return () => {
      stopRestoring();
      element.removeEventListener('scroll', onScroll);
      element.removeEventListener('touchstart', onUserScroll);
      element.removeEventListener('wheel', onUserScroll);
    };
  }, [key, ref]);
}

/**
 * The scroll container of the current screen layer (tab page or pushed screen) – e.g. for a
 * large title that collapses into the inline header while scrolling.
 */
export const ScrollContainerContext = createContext<RefObject<HTMLElement | null> | null>(null);

export function useScrollContainer(): RefObject<HTMLElement | null> | null {
  return useContext(ScrollContainerContext);
}
