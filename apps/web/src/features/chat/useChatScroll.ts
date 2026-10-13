import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { prefersReducedMotion } from '@/components/utils';

/*
 * Scroll behaviour of the conversation screen inside the layer's scroll container (pages never
 * own a scroll container): initial position (bottom, or the unread divider), stick-to-bottom for
 * new messages / keyboard / composer growth, "Neue Nachrichten" pill while scrolled up, and
 * loading older history at the top without the content jumping.
 */

/** Distance from the bottom that still counts as "at the bottom". */
const BOTTOM_SLOP_PX = 48;
/** Start loading older messages this close to the top. */
const LOAD_OLDER_THRESHOLD_PX = 240;
/** Keep the unread divider below the floating chat header (avatar + name pill). */
const HEADER_CLEARANCE_PX = 140;

export interface ChatScrollOptions {
  containerRef: RefObject<HTMLElement | null> | null;
  /** Element whose size changes with content, keyboard inset and composer height. */
  contentRef: RefObject<HTMLElement | null>;
  /** First render with data happened. */
  ready: boolean;
  /** Key of the newest row (incl. optimistic messages). */
  newestKey: string | null;
  /** The newest row was sent by the caller. */
  newestIsMine: boolean;
  /** Key of the oldest loaded message row. */
  oldestKey: string | null;
  hasOlder: boolean;
  loadingOlder: boolean;
  loadOlder: () => void;
}

export interface ChatScroll {
  /**
   * The bottom of the history is on screen. `false` until the initial position has been applied
   * (bottom or unread divider), so nothing is marked read before the user could see it.
   */
  atBottom: boolean;
  /** The initial scroll position has been applied. */
  positioned: boolean;
  /** New messages arrived while scrolled up. */
  showNewPill: boolean;
  scrollToBottom: (smooth?: boolean) => void;
}

function distanceFromBottom(element: HTMLElement): number {
  return element.scrollHeight - element.scrollTop - element.clientHeight;
}

/** Imperative scroll position write (kept outside the hook body for the React compiler). */
function setScrollTop(element: HTMLElement, top: number): void {
  element.scrollTop = top;
}

/** Offset of `row` from the top of the scroll content of `container`. */
function offsetInContainer(container: HTMLElement, row: Element): number {
  return row.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
}

export function useChatScroll(options: ChatScrollOptions): ChatScroll {
  const { containerRef, contentRef, ready, newestKey, newestIsMine, oldestKey, hasOlder, loadingOlder, loadOlder } =
    options;
  const [atBottom, setAtBottom] = useState(false);
  const [isPositioned, setIsPositioned] = useState(false);
  const [showNewPill, setShowNewPill] = useState(false);
  const atBottomRef = useRef(false);
  const positioned = useRef(false);
  const lastNewestKey = useRef<string | null>(null);
  const anchor = useRef<{ key: string; offset: number } | null>(null);
  const olderState = useRef({ hasOlder, loadingOlder, loadOlder });
  useEffect(() => {
    olderState.current = { hasOlder, loadingOlder, loadOlder };
  }, [hasOlder, loadingOlder, loadOlder]);

  const scrollToBottom = useCallback(
    (smooth = false) => {
      const element = containerRef?.current;
      if (!element) return;
      const top = element.scrollHeight - element.clientHeight;
      if (smooth && !prefersReducedMotion() && typeof element.scrollTo === 'function') {
        element.scrollTo({ top, behavior: 'smooth' });
      } else {
        setScrollTop(element, top);
      }
      atBottomRef.current = true;
      setAtBottom(true);
      setShowNewPill(false);
    },
    [containerRef],
  );

  // Scroll tracking + "load older" trigger.
  useEffect(() => {
    const element = containerRef?.current;
    if (!element) return undefined;
    const onScroll = () => {
      // Before the initial position is applied the loading state may scroll; it says nothing.
      if (!positioned.current) return;
      const bottom = distanceFromBottom(element) <= BOTTOM_SLOP_PX;
      atBottomRef.current = bottom;
      setAtBottom(bottom);
      if (bottom) setShowNewPill(false);
      const older = olderState.current;
      if (element.scrollTop < LOAD_OLDER_THRESHOLD_PX && older.hasOlder && !older.loadingOlder && !anchor.current) {
        const firstRow = contentRef.current?.querySelector<HTMLElement>('[data-row-type="message"]');
        if (firstRow?.dataset.rowKey) {
          anchor.current = {
            key: firstRow.dataset.rowKey,
            offset: offsetInContainer(element, firstRow) - element.scrollTop,
          };
        }
        older.loadOlder();
      }
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, [containerRef, contentRef]);

  // Initial position: the bottom, or the unread divider when it would be off-screen.
  useLayoutEffect(() => {
    const element = containerRef?.current;
    if (!ready || positioned.current || !element) return;
    positioned.current = true;
    lastNewestKey.current = newestKey;
    const max = element.scrollHeight - element.clientHeight;
    const divider = contentRef.current?.querySelector('[data-row-type="unread"]');
    const target = divider ? Math.min(max, offsetInContainer(element, divider) - HEADER_CLEARANCE_PX) : max;
    setScrollTop(element, Math.max(0, target));
    const bottom = distanceFromBottom(element) <= BOTTOM_SLOP_PX;
    atBottomRef.current = bottom;
    setAtBottom(bottom);
    setIsPositioned(true);
  }, [containerRef, contentRef, ready, newestKey]);

  // Older history rendered above: restore the anchor row's on-screen position.
  useLayoutEffect(() => {
    const element = containerRef?.current;
    const saved = anchor.current;
    if (!element || !saved) return;
    const row = contentRef.current?.querySelector(`[data-row-key="${CSS.escape(saved.key)}"]`);
    if (row) setScrollTop(element, offsetInContainer(element, row) - saved.offset);
    anchor.current = null;
  }, [containerRef, contentRef, oldestKey]);

  useEffect(() => {
    // A finished (or failed) load releases the anchor; on success the layout effect above has
    // already used it in the same commit.
    if (!loadingOlder) anchor.current = null;
  }, [loadingOlder]);

  // New newest row: follow it when it is ours or we were at the bottom; else offer the pill.
  useLayoutEffect(() => {
    if (!positioned.current || newestKey === lastNewestKey.current) return;
    lastNewestKey.current = newestKey;
    if (!newestKey) return;
    if (newestIsMine || atBottomRef.current) scrollToBottom(true);
    else setShowNewPill(true);
  }, [newestKey, newestIsMine, scrollToBottom]);

  // Keyboard, composer growth, late images/fonts: keep the bottom pinned while at the bottom.
  useEffect(() => {
    const element = containerRef?.current;
    const target = contentRef.current;
    if (!element || !target) return undefined;
    const pin = () => setScrollTop(element, element.scrollHeight - element.clientHeight);
    const keepPinned = () => {
      if (positioned.current && atBottomRef.current) pin();
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(keepPinned);
    observer?.observe(target);
    observer?.observe(element);
    // The screen's bottom padding follows `--keyboard-inset` and `--composer-height`; a padding
    // change only alters the border box (the content box keeps its size).
    const screen = target.closest('.homi-screen');
    if (screen) observer?.observe(screen, { box: 'border-box' });
    // The keyboard: `useKeyboardInset` applies `--keyboard-inset` in the next animation frame, so
    // re-pin only after that (two frames) – but decide with the position from before the resize.
    let frame = 0;
    const onViewportResize = () => {
      if (!positioned.current || !atBottomRef.current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(pin);
      });
    };
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', onViewportResize);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      viewport?.removeEventListener('resize', onViewportResize);
    };
  }, [containerRef, contentRef, ready]);

  return { atBottom, positioned: isPositioned, showNewPill, scrollToBottom };
}
