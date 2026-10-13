import { useEffect, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { useChatScroll, type ChatScroll } from './useChatScroll';

/*
 * Regressions from the review (jsdom has no layout: the scroll container's metrics and the unread
 * divider's position are stubbed).
 */

const CLEARANCE = 140; // HEADER_CLEARANCE_PX
const metrics = { scrollHeight: 3000, clientHeight: 800, dividerOffset: 1000 };
let scrollTop = 0;

function createScroller(): HTMLElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'scrollHeight', { configurable: true, get: () => metrics.scrollHeight });
  Object.defineProperty(element, 'clientHeight', { configurable: true, get: () => metrics.clientHeight });
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = Math.max(0, Math.min(value, metrics.scrollHeight - metrics.clientHeight));
    },
  });
  document.body.appendChild(element);
  return element;
}

function stubViewport(viewport: EventTarget): void {
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
}

interface HarnessProps {
  containerRef: { current: HTMLElement | null };
  ready: boolean;
  withDivider: boolean;
  /** `atBottom` as seen by passive effects once ready (like ConversationPage's read effect). */
  seen: boolean[];
  onScroll?: (scroll: ChatScroll) => void;
}

function Harness({ containerRef, ready, withDivider, seen, onScroll }: HarnessProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const scroll = useChatScroll({
    containerRef,
    contentRef,
    ready,
    newestKey: ready ? 'm60' : null,
    newestIsMine: false,
    oldestKey: ready ? 'm1' : null,
    hasOlder: false,
    loadingOlder: false,
    loadOlder: () => undefined,
  });
  useEffect(() => {
    if (ready) seen.push(scroll.atBottom);
    onScroll?.(scroll);
  });
  return <div ref={contentRef}>{ready && withDivider ? <div data-row-type="unread" /> : null}</div>;
}

describe('useChatScroll', () => {
  let scroller: HTMLElement;
  let containerRef: { current: HTMLElement | null };

  beforeEach(() => {
    metrics.scrollHeight = 3000;
    metrics.clientHeight = 800;
    scrollTop = 0;
    scroller = createScroller();
    containerRef = { current: scroller };
    const original = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.getAttribute('data-row-type') === 'unread') {
        const top = metrics.dividerOffset - scrollTop;
        return { x: 0, y: top, top, left: 0, right: 393, bottom: top + 16, width: 393, height: 16 } as DOMRect;
      }
      return original.call(this);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, 'visualViewport');
    scroller.remove();
  });

  // Review: opening a chat with many unread messages marked them all read immediately, because
  // the read effect saw the initial `atBottom: true` before the divider position was applied.
  it('never reports the bottom as visible while the view opens at a far-up unread divider', () => {
    const seen: boolean[] = [];
    let last: ChatScroll | null = null;
    const { rerender } = render(
      <Harness containerRef={containerRef} ready={false} withDivider seen={seen} onScroll={(s) => (last = s)} />,
    );
    expect(last).toMatchObject({ atBottom: false, positioned: false });

    rerender(<Harness containerRef={containerRef} ready withDivider seen={seen} onScroll={(s) => (last = s)} />);
    expect(scrollTop).toBe(metrics.dividerOffset - CLEARANCE);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain(true);
    expect(last).toMatchObject({ atBottom: false, positioned: true });
  });

  it('reports the bottom once positioned there', () => {
    const seen: boolean[] = [];
    let last: ChatScroll | null = null;
    render(<Harness containerRef={containerRef} ready withDivider={false} seen={seen} onScroll={(s) => (last = s)} />);
    expect(scrollTop).toBe(metrics.scrollHeight - metrics.clientHeight);
    expect(seen.at(-1)).toBe(true);
    expect(last).toMatchObject({ atBottom: true, positioned: true });
  });

  // Review: the keyboard hid the newest messages – the pin ran on the viewport `resize`, before
  // `useKeyboardInset` applied `--keyboard-inset` (and with it the larger bottom padding).
  it('stays pinned to the bottom when the keyboard inset is applied a frame after the resize', async () => {
    const viewport = new EventTarget();
    stubViewport(viewport);
    // Like useKeyboardInset (mounted first at the app root): the padding grows one frame later.
    viewport.addEventListener('resize', () => {
      requestAnimationFrame(() => {
        metrics.scrollHeight = 3000 + 302;
      });
    });
    render(<Harness containerRef={containerRef} ready withDivider={false} seen={[]} />);
    expect(scrollTop).toBe(2200);

    viewport.dispatchEvent(new Event('resize'));
    await waitFor(() => expect(scrollTop).toBe(3302 - 800));
  });

  it('does not pull a reader who scrolled up down to the bottom when the keyboard opens', async () => {
    const viewport = new EventTarget();
    stubViewport(viewport);
    render(<Harness containerRef={containerRef} ready withDivider={false} seen={[]} />);
    scroller.scrollTop = 500;
    scroller.dispatchEvent(new Event('scroll'));

    viewport.dispatchEvent(new Event('resize'));
    metrics.scrollHeight = 3302;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(scrollTop).toBe(500);
  });
});
