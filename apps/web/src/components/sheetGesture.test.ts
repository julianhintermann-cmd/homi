import { describe, expect, it } from 'vitest';
import {
  resolveDismissRequest,
  rubberband,
  sheetDragOffset,
  shouldDismissSheet,
  SHEET_DISMISS_MAX_DISTANCE,
  SHEET_DISMISS_VELOCITY,
  SHEET_FLICK_MIN_DISTANCE,
  velocityFromSamples,
} from './sheetGesture';

describe('shouldDismissSheet', () => {
  it('never dismisses when not dragged down', () => {
    expect(shouldDismissSheet({ offset: 0, velocity: 5000, height: 300 })).toBe(false);
    expect(shouldDismissSheet({ offset: -40, velocity: 5000, height: 300 })).toBe(false);
  });

  it('dismisses past 30 % of the sheet height', () => {
    expect(shouldDismissSheet({ offset: 89, velocity: 0, height: 300 })).toBe(false);
    expect(shouldDismissSheet({ offset: 90, velocity: 0, height: 300 })).toBe(true);
  });

  it('caps the distance threshold for tall page sheets', () => {
    expect(shouldDismissSheet({ offset: SHEET_DISMISS_MAX_DISTANCE, velocity: 0, height: 794 })).toBe(true);
    expect(shouldDismissSheet({ offset: SHEET_DISMISS_MAX_DISTANCE - 1, velocity: 0, height: 794 })).toBe(false);
  });

  it('dismisses on a downward flick, but not on a jittery tap', () => {
    expect(
      shouldDismissSheet({ offset: SHEET_FLICK_MIN_DISTANCE, velocity: SHEET_DISMISS_VELOCITY, height: 794 }),
    ).toBe(true);
    expect(shouldDismissSheet({ offset: SHEET_FLICK_MIN_DISTANCE - 1, velocity: 5000, height: 794 })).toBe(false);
  });

  it('keeps the sheet when the user flicks back up', () => {
    expect(shouldDismissSheet({ offset: 150, velocity: -SHEET_DISMISS_VELOCITY, height: 300 })).toBe(false);
  });
});

describe('resolveDismissRequest', () => {
  it('closes clean sheets and asks first for dirty ones', () => {
    expect(resolveDismissRequest({ dismiss: true, dirty: false })).toBe('close');
    expect(resolveDismissRequest({ dismiss: true, dirty: true })).toBe('confirm');
    expect(resolveDismissRequest({ dismiss: false, dirty: true })).toBe('stay');
  });
});

describe('rubberband / sheetDragOffset', () => {
  it('is monotonic and bounded by the dimension', () => {
    const a = rubberband(50, 200);
    const b = rubberband(500, 200);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(200);
    expect(rubberband(0, 200)).toBe(0);
  });

  it('follows the finger downwards and resists upwards', () => {
    expect(sheetDragOffset(120, 600)).toBe(120);
    const up = sheetDragOffset(-120, 600);
    expect(up).toBeLessThan(0);
    expect(up).toBeGreaterThan(-120);
  });
});

describe('velocityFromSamples', () => {
  it('measures px/s over the most recent 100 ms', () => {
    const samples = [
      { t: 0, y: 0 },
      { t: 500, y: 10 },
      { t: 550, y: 60 },
      { t: 600, y: 110 },
    ];
    expect(velocityFromSamples(samples)).toBeCloseTo(1000);
  });

  it('returns 0 without movement data', () => {
    expect(velocityFromSamples([])).toBe(0);
    expect(velocityFromSamples([{ t: 10, y: 10 }])).toBe(0);
  });
});
