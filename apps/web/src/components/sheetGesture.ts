/**
 * Pure drag-to-dismiss logic for `HomiBottomSheet` (unit-tested in sheetGesture.test.ts).
 */

/** A downward flick faster than this (px/s) dismisses regardless of distance. */
export const SHEET_DISMISS_VELOCITY = 800;
/** Dragging further than this fraction of the sheet height dismisses on release. */
export const SHEET_DISMISS_DISTANCE_RATIO = 0.3;
/** …but never requires more than this many px (tall page sheets). */
export const SHEET_DISMISS_MAX_DISTANCE = 220;
/** A flick needs at least this much travel, so a tap with jitter never closes the sheet. */
export const SHEET_FLICK_MIN_DISTANCE = 24;
/** Movement before a press on the handle becomes a drag (taps on buttons stay taps). */
export const SHEET_DRAG_SLOP = 6;

export interface SheetRelease {
  /** Current downward offset in px (negative = pulled up). */
  offset: number;
  /** Release velocity in px/s (positive = downward). */
  velocity: number;
  /** Height of the sheet panel in px. */
  height: number;
}

/** Whether releasing a drag should dismiss the sheet. */
export function shouldDismissSheet({ offset, velocity, height }: SheetRelease): boolean {
  if (offset <= 0) return false;
  if (velocity >= SHEET_DISMISS_VELOCITY && offset >= SHEET_FLICK_MIN_DISTANCE) return true;
  // Flicked back up: the user changed their mind.
  if (velocity <= -SHEET_DISMISS_VELOCITY / 2) return false;
  const threshold = Math.min(height * SHEET_DISMISS_DISTANCE_RATIO, SHEET_DISMISS_MAX_DISTANCE);
  return offset >= threshold;
}

export type DismissOutcome = 'close' | 'confirm' | 'stay';

/** What a dismiss request (drag, backdrop, Escape, close button) leads to. */
export function resolveDismissRequest({ dismiss, dirty }: { dismiss: boolean; dirty: boolean }): DismissOutcome {
  if (!dismiss) return 'stay';
  return dirty ? 'confirm' : 'close';
}

/**
 * iOS-style rubber band: the further you pull past a limit, the less the sheet follows.
 * `distance` ≥ 0 is the overshoot, `dimension` the reference size.
 */
export function rubberband(distance: number, dimension: number, constant = 0.55): number {
  if (distance <= 0 || dimension <= 0) return 0;
  return (1 - 1 / ((distance * constant) / dimension + 1)) * dimension;
}

/** Sheet offset for a raw finger delta: 1:1 downwards, rubber-banded upwards. */
export function sheetDragOffset(delta: number, height: number): number {
  return delta >= 0 ? delta : -rubberband(-delta, Math.max(height, 1) * 0.25);
}

export interface PointerSample {
  /** Timestamp in ms. */
  t: number;
  /** Position in px. */
  y: number;
}

/** Velocity (px/s) over the samples of the last `window` ms. */
export function velocityFromSamples(samples: readonly PointerSample[], window = 100): number {
  const last = samples[samples.length - 1];
  if (!last) return 0;
  let first = last;
  for (let i = samples.length - 1; i >= 0; i -= 1) {
    const sample = samples[i];
    if (!sample || last.t - sample.t > window) break;
    first = sample;
  }
  const dt = last.t - first.t;
  return dt > 0 ? ((last.y - first.y) / dt) * 1000 : 0;
}
