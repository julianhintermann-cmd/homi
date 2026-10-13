import { useCallback, useState } from 'react';

/*
 * Expanded state of the "Erledigt · n" disclosure, remembered per browser (localStorage is a
 * per-viewer convenience here – it may be unavailable, e.g. in private mode, and then simply
 * starts collapsed).
 */

export const COMPLETED_EXPANDED_STORAGE_KEY = 'homi.shopping.completedExpanded';

export function readCompletedExpanded(): boolean {
  try {
    return window.localStorage.getItem(COMPLETED_EXPANDED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeCompletedExpanded(expanded: boolean): void {
  try {
    window.localStorage.setItem(COMPLETED_EXPANDED_STORAGE_KEY, expanded ? '1' : '0');
  } catch {
    // Storage blocked or full – the state just is not remembered.
  }
}

/** `[expanded, setExpanded]` persisted in localStorage. */
export function useCompletedExpanded(): [boolean, (next: boolean | ((current: boolean) => boolean)) => void] {
  const [expanded, setExpandedState] = useState(readCompletedExpanded);
  const setExpanded = useCallback((next: boolean | ((current: boolean) => boolean)) => {
    setExpandedState((current) => {
      const value = typeof next === 'function' ? next(current) : next;
      writeCompletedExpanded(value);
      return value;
    });
  }, []);
  return [expanded, setExpanded];
}
