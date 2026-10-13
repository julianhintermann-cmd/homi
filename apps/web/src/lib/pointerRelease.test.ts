import { afterEach, describe, expect, it, vi } from 'vitest';
import { afterPointerRelease, isPointerPressed } from './pointerRelease';

const fire = (type: 'pointerdown' | 'pointerup' | 'pointercancel') =>
  document.body.dispatchEvent(new Event(type, { bubbles: true }));

afterEach(() => {
  fire('pointerup');
  vi.useRealTimers();
});

describe('afterPointerRelease', () => {
  it('runs in the next task when no pointer is down', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    afterPointerRelease(callback);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('holds the callback back until the pointer is released (plus one task)', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    fire('pointerdown');
    expect(isPointerPressed()).toBe(true);
    afterPointerRelease(callback);
    vi.advanceTimersByTime(500);
    expect(callback).not.toHaveBeenCalled();

    fire('pointerup');
    expect(isPointerPressed()).toBe(false);
    expect(callback).not.toHaveBeenCalled(); // the click of the same tap is still being dispatched
    vi.advanceTimersByTime(0);
    expect(callback).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('also continues after a cancelled press', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    fire('pointerdown');
    afterPointerRelease(callback);
    fire('pointercancel');
    vi.advanceTimersByTime(0);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('never holds a callback back for more than a second', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    fire('pointerdown');
    afterPointerRelease(callback);
    vi.advanceTimersByTime(999);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
    fire('pointerup');
    vi.advanceTimersByTime(10);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('can be cancelled', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    fire('pointerdown');
    const cancel = afterPointerRelease(callback);
    cancel();
    fire('pointerup');
    vi.advanceTimersByTime(2_000);
    const immediate = vi.fn();
    afterPointerRelease(immediate)();
    vi.advanceTimersByTime(10);
    expect(callback).not.toHaveBeenCalled();
    expect(immediate).not.toHaveBeenCalled();
  });
});
