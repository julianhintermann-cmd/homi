import { describe, expect, it } from 'vitest';
import {
  classifySwipe,
  isPastFullSwipe,
  resolveSwipeSnap,
  snapOffset,
  swipeDragOffset,
  SWIPE_ACTION_WIDTH,
  SWIPE_DECISION_SLOP,
  SWIPE_FULL_RATIO,
  SWIPE_SNAP_VELOCITY,
  type SwipeGeometry,
} from './swipeActions';

const geometry: SwipeGeometry = { actionsWidth: SWIPE_ACTION_WIDTH, rowWidth: 353, fullSwipe: true };

describe('classifySwipe', () => {
  it('waits until the finger moved past the slop', () => {
    expect(classifySwipe(SWIPE_DECISION_SLOP - 1, 2)).toBeNull();
  });

  it('claims clearly horizontal gestures only', () => {
    expect(classifySwipe(-20, 4)).toBe('horizontal');
    expect(classifySwipe(-12, 11)).toBe('vertical'); // diagonal → leave it to scrolling
    expect(classifySwipe(3, 30)).toBe('vertical');
  });
});

describe('swipeDragOffset', () => {
  it('follows the finger within the actions', () => {
    expect(swipeDragOffset(-40, { ...geometry, fullSwipe: false })).toBe(-40);
  });

  it('rubber-bands past the actions when full swipe is off', () => {
    const offset = swipeDragOffset(-200, { ...geometry, fullSwipe: false });
    expect(offset).toBeLessThan(-SWIPE_ACTION_WIDTH);
    expect(offset).toBeGreaterThan(-200);
  });

  it('allows dragging to the full row width when full swipe is on', () => {
    expect(swipeDragOffset(-300, geometry)).toBe(-300);
    expect(swipeDragOffset(-500, geometry)).toBeGreaterThan(-500);
  });

  it('resists dragging to the right (no leading actions)', () => {
    const offset = swipeDragOffset(80, geometry);
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThan(80);
  });
});

describe('resolveSwipeSnap', () => {
  it('stays closed for small drags', () => {
    expect(resolveSwipeSnap({ ...geometry, offset: -20, velocity: 0 })).toBe('closed');
  });

  it('opens past half of the actions width', () => {
    expect(resolveSwipeSnap({ ...geometry, offset: -(SWIPE_ACTION_WIDTH / 2 + 1), velocity: 0 })).toBe('open');
  });

  it('respects a fast flick in either direction', () => {
    expect(resolveSwipeSnap({ ...geometry, offset: -15, velocity: -SWIPE_SNAP_VELOCITY - 1 })).toBe('open');
    expect(resolveSwipeSnap({ ...geometry, offset: -70, velocity: SWIPE_SNAP_VELOCITY + 1 })).toBe('closed');
  });

  it('triggers the primary action past the full-swipe threshold', () => {
    const distance = Math.ceil(geometry.rowWidth * SWIPE_FULL_RATIO);
    expect(resolveSwipeSnap({ ...geometry, offset: -distance, velocity: 0 })).toBe('full');
    expect(resolveSwipeSnap({ ...geometry, offset: -distance, velocity: 0, fullSwipe: false })).toBe('open');
  });

  it('treats a hard flick well past the actions as a full swipe', () => {
    expect(resolveSwipeSnap({ ...geometry, offset: -(SWIPE_ACTION_WIDTH + 60), velocity: -2000 })).toBe('full');
  });

  it('never opens without actions', () => {
    expect(resolveSwipeSnap({ ...geometry, actionsWidth: 0, offset: -200, velocity: -2000 })).toBe('closed');
  });
});

describe('snapOffset / isPastFullSwipe', () => {
  it('maps snap points to resting offsets', () => {
    expect(snapOffset('closed', geometry)).toBe(0);
    expect(snapOffset('open', geometry)).toBe(-SWIPE_ACTION_WIDTH);
    expect(snapOffset('full', geometry)).toBe(-353);
  });

  it('detects the full-swipe threshold only when enabled', () => {
    expect(isPastFullSwipe(-300, geometry)).toBe(true);
    expect(isPastFullSwipe(-100, geometry)).toBe(false);
    expect(isPastFullSwipe(-300, { ...geometry, fullSwipe: false })).toBe(false);
  });
});
