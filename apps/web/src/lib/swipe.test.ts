import { describe, expect, it } from 'vitest';
import {
  decideSwipe,
  isEdgeStart,
  isSwipeBlockedTarget,
  resolveSwipeTarget,
  SWIPE_EDGE_GUARD_PX,
  type SwipeGesture,
} from './swipe';

const VIEWPORT = 393; // iPhone 15/16 Pro width used in the design frames

function gesture(dx: number, dy: number, startX = 200, startY = 400): SwipeGesture {
  return { startX, startY, endX: startX + dx, endY: startY + dy, viewportWidth: VIEWPORT };
}

describe('decideSwipe', () => {
  it('swiping left goes to the next tab, swiping right to the previous one', () => {
    expect(decideSwipe(gesture(-120, 10))).toBe('next');
    expect(decideSwipe(gesture(120, -10))).toBe('previous');
  });

  it('requires more than 60 px of horizontal travel', () => {
    expect(decideSwipe(gesture(-60, 0))).toBeNull();
    expect(decideSwipe(gesture(60, 0))).toBeNull();
    expect(decideSwipe(gesture(-61, 0))).toBe('next');
  });

  it('requires |dx| > 1.5 · |dy| (vertical scrolling wins otherwise)', () => {
    expect(decideSwipe(gesture(-90, 60))).toBeNull(); // exactly 1.5×
    expect(decideSwipe(gesture(-91, 60))).toBe('next');
    expect(decideSwipe(gesture(100, 100))).toBeNull();
    expect(decideSwipe(gesture(10, 300))).toBeNull();
  });

  it('ignores gestures starting within 24 px of either screen edge (Safari back/forward)', () => {
    expect(decideSwipe(gesture(150, 0, 10))).toBeNull();
    expect(decideSwipe(gesture(150, 0, SWIPE_EDGE_GUARD_PX - 1))).toBeNull();
    expect(decideSwipe(gesture(150, 0, SWIPE_EDGE_GUARD_PX))).toBe('previous');
    expect(decideSwipe(gesture(-150, 0, VIEWPORT - 5))).toBeNull();
    expect(decideSwipe(gesture(-150, 0, VIEWPORT - SWIPE_EDGE_GUARD_PX))).toBe('next');
  });
});

describe('isEdgeStart', () => {
  it('detects both edges', () => {
    expect(isEdgeStart(0, VIEWPORT)).toBe(true);
    expect(isEdgeStart(23.9, VIEWPORT)).toBe(true);
    expect(isEdgeStart(24, VIEWPORT)).toBe(false);
    expect(isEdgeStart(VIEWPORT - 24, VIEWPORT)).toBe(false);
    expect(isEdgeStart(VIEWPORT - 23, VIEWPORT)).toBe(true);
  });
});

describe('resolveSwipeTarget', () => {
  it('moves to neighbouring tabs without wrapping around', () => {
    expect(resolveSwipeTarget(0, 4, 'next')).toBe(1);
    expect(resolveSwipeTarget(3, 4, 'previous')).toBe(2);
    expect(resolveSwipeTarget(0, 4, 'previous')).toBeNull();
    expect(resolveSwipeTarget(3, 4, 'next')).toBeNull();
    expect(resolveSwipeTarget(-1, 4, 'next')).toBeNull();
  });
});

describe('isSwipeBlockedTarget', () => {
  function setup(html: string): HTMLElement {
    const surface = document.createElement('div');
    surface.innerHTML = html;
    document.body.append(surface);
    return surface;
  }

  it('blocks form fields and contenteditable', () => {
    const surface = setup(
      '<input id="i"><textarea id="t"></textarea><select id="s"></select><div contenteditable id="c"><b id="cb">x</b></div>',
    );
    for (const id of ['i', 't', 's', 'c', 'cb']) {
      expect(isSwipeBlockedTarget(surface.querySelector(`#${id}`), surface)).toBe(true);
    }
  });

  it('blocks elements inside [data-no-swipe] (e.g. swipeable rows)', () => {
    const surface = setup('<div data-no-swipe><span id="row">Milch</span></div><p id="free">Text</p>');
    expect(isSwipeBlockedTarget(surface.querySelector('#row'), surface)).toBe(true);
    expect(isSwipeBlockedTarget(surface.querySelector('#free'), surface)).toBe(false);
  });

  it('blocks horizontally scrollable areas such as chip rows', () => {
    const surface = setup('<div id="chips" style="overflow-x: auto"><button id="chip">Küche</button></div>');
    const chips = surface.querySelector<HTMLElement>('#chips');
    if (!chips) throw new Error('missing');
    Object.defineProperty(chips, 'scrollWidth', { value: 800, configurable: true });
    Object.defineProperty(chips, 'clientWidth', { value: 353, configurable: true });
    expect(isSwipeBlockedTarget(surface.querySelector('#chip'), surface)).toBe(true);

    // Same element without overflow content is not a scroller.
    Object.defineProperty(chips, 'scrollWidth', { value: 353, configurable: true });
    expect(isSwipeBlockedTarget(surface.querySelector('#chip'), surface)).toBe(false);
  });

  it('ignores blockers outside the swipe surface and non-element targets', () => {
    const outer = setup('<div data-no-swipe id="outer"></div>');
    const surface = document.createElement('div');
    surface.innerHTML = '<p id="inside">x</p>';
    outer.querySelector('#outer')?.append(surface);
    expect(isSwipeBlockedTarget(surface.querySelector('#inside'), surface)).toBe(false);
    expect(isSwipeBlockedTarget(null, surface)).toBe(false);
    expect(isSwipeBlockedTarget(window, surface)).toBe(false);
  });
});
