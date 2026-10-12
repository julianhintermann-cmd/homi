/**
 * Pure gesture logic for `SwipeableRow` (iOS-style trailing swipe actions), unit-tested in
 * swipeActions.test.ts. Offsets are negative when the row content is moved to the left.
 */
import { rubberband } from './sheetGesture';

/** Width of one revealed action button. */
export const SWIPE_ACTION_WIDTH = 76;
/** Finger travel before the gesture is classified as horizontal or vertical. */
export const SWIPE_DECISION_SLOP = 8;
/** Horizontal travel must exceed this multiple of the vertical travel to claim the gesture. */
export const SWIPE_CLAIM_RATIO = 1.2;
/** Release velocity (px/s) that snaps open/closed regardless of the position. */
export const SWIPE_SNAP_VELOCITY = 350;
/** Dragging past this fraction of the row width triggers the primary action (full swipe). */
export const SWIPE_FULL_RATIO = 0.6;
/** A fast flick needs at least this much travel beyond the actions to count as a full swipe. */
export const SWIPE_FULL_FLICK_EXTRA = 48;
export const SWIPE_FULL_FLICK_VELOCITY = 1400;

export type SwipeAxis = 'horizontal' | 'vertical';

/** Classifies the gesture once it moved far enough; `null` = undecided yet. */
export function classifySwipe(dx: number, dy: number): SwipeAxis | null {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < SWIPE_DECISION_SLOP && absY < SWIPE_DECISION_SLOP) return null;
  return absX > absY * SWIPE_CLAIM_RATIO ? 'horizontal' : 'vertical';
}

export interface SwipeGeometry {
  /** Total width of the trailing actions (count × SWIPE_ACTION_WIDTH). */
  actionsWidth: number;
  /** Width of the row. */
  rowWidth: number;
  /** Whether a full swipe triggers the primary action. */
  fullSwipe: boolean;
}

/**
 * Content offset while dragging: follows the finger up to the limit (the actions, or the full row
 * width when full-swipe is enabled) and rubber-bands beyond it and to the right.
 */
export function swipeDragOffset(rawOffset: number, { actionsWidth, rowWidth, fullSwipe }: SwipeGeometry): number {
  if (rawOffset > 0) return rubberband(rawOffset, 60);
  const distance = -rawOffset;
  const limit = fullSwipe ? rowWidth : actionsWidth;
  if (distance <= limit) return rawOffset;
  return -(limit + rubberband(distance - limit, Math.max(rowWidth, 1) * 0.5));
}

export type SwipeSnap = 'closed' | 'open' | 'full';

export interface SwipeRelease extends SwipeGeometry {
  /** Content offset at release (≤ 0 when swiped left). */
  offset: number;
  /** Horizontal velocity in px/s (negative = moving left). */
  velocity: number;
}

/** Where the row settles after the finger lifts. */
export function resolveSwipeSnap({ offset, velocity, actionsWidth, rowWidth, fullSwipe }: SwipeRelease): SwipeSnap {
  const distance = -offset;
  if (distance <= 0 || actionsWidth <= 0) return 'closed';
  if (fullSwipe) {
    if (distance >= rowWidth * SWIPE_FULL_RATIO) return 'full';
    if (velocity <= -SWIPE_FULL_FLICK_VELOCITY && distance >= actionsWidth + SWIPE_FULL_FLICK_EXTRA) return 'full';
  }
  if (velocity <= -SWIPE_SNAP_VELOCITY) return 'open';
  if (velocity >= SWIPE_SNAP_VELOCITY) return 'closed';
  return distance >= actionsWidth / 2 ? 'open' : 'closed';
}

/** Resting offset of a snap point. */
export function snapOffset(
  snap: SwipeSnap,
  { actionsWidth, rowWidth }: Pick<SwipeGeometry, 'actionsWidth' | 'rowWidth'>,
): number {
  if (snap === 'open') return -actionsWidth;
  if (snap === 'full') return -rowWidth;
  return 0;
}

/** `true` once a drag crosses the full-swipe threshold (used for a single haptic tick). */
export function isPastFullSwipe(
  offset: number,
  { rowWidth, fullSwipe }: Pick<SwipeGeometry, 'rowWidth' | 'fullSwipe'>,
): boolean {
  return fullSwipe && -offset >= rowWidth * SWIPE_FULL_RATIO;
}
