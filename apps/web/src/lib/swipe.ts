/**
 * Pure decision logic for the horizontal swipe between the four tab screens.
 * Kept free of React so it can be unit-tested exhaustively (see swipe.test.ts).
 */

/** Touches starting this close to the left/right screen edge are left to Safari's back/forward gesture. */
export const SWIPE_EDGE_GUARD_PX = 24;
/** Minimum horizontal travel for a swipe to count. */
export const SWIPE_MIN_DISTANCE_PX = 60;
/** Horizontal travel must exceed this multiple of the vertical travel. */
export const SWIPE_DIRECTION_RATIO = 1.5;

export type SwipeDirection = 'next' | 'previous';

export interface SwipeGesture {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  /** Width of the layout viewport (`window.innerWidth`). */
  viewportWidth: number;
}

export function isEdgeStart(startX: number, viewportWidth: number, guard: number = SWIPE_EDGE_GUARD_PX): boolean {
  return startX < guard || startX > viewportWidth - guard;
}

/**
 * Returns the swipe direction or `null` when the gesture must be ignored.
 * Swiping left (negative dx) moves to the next tab, swiping right to the previous one.
 */
export function decideSwipe(gesture: SwipeGesture): SwipeDirection | null {
  if (isEdgeStart(gesture.startX, gesture.viewportWidth)) return null;
  const dx = gesture.endX - gesture.startX;
  const dy = gesture.endY - gesture.startY;
  const absX = Math.abs(dx);
  if (absX <= SWIPE_MIN_DISTANCE_PX) return null;
  if (absX <= SWIPE_DIRECTION_RATIO * Math.abs(dy)) return null;
  return dx < 0 ? 'next' : 'previous';
}

/** Target tab index for a swipe, or `null` at the ends (no wrap-around, like iOS). */
export function resolveSwipeTarget(currentIndex: number, count: number, direction: SwipeDirection): number | null {
  if (currentIndex < 0 || currentIndex >= count) return null;
  const target = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
  return target >= 0 && target < count ? target : null;
}

const BLOCKING_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[data-no-swipe]',
  '[role="slider"]',
].join(',');

function isHorizontallyScrollable(element: Element): boolean {
  if (element.scrollWidth <= element.clientWidth + 1) return false;
  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  const { overflowX } = view.getComputedStyle(element);
  return overflowX === 'auto' || overflowX === 'scroll';
}

/**
 * `true` when a gesture starting on `target` must not switch tabs: form fields, elements
 * opting out via `[data-no-swipe]` (e.g. swipeable rows) and horizontally scrollable areas
 * (chip rows). Walks up from `target` to (excluding) `boundary`.
 */
export function isSwipeBlockedTarget(target: EventTarget | null, boundary: Element | null): boolean {
  if (!(target instanceof Element)) return false;
  // Only count blockers inside the swipe surface.
  const blocker = target.closest(BLOCKING_SELECTOR);
  if (blocker && (!boundary || boundary.contains(blocker))) return true;
  let node: Element | null = target;
  while (node && node !== boundary) {
    if (isHorizontallyScrollable(node)) return true;
    node = node.parentElement;
  }
  return false;
}
