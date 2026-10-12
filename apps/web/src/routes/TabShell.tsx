import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';
import { AnimatePresence, useReducedMotion } from 'motion/react';
import { useLocation, useNavigate, useNavigationType, useOutlet } from 'react-router';
import { HomiTabBar, type HomiTabBarItem } from '@/components/HomiTabBar';
import { haptic } from '@/lib/haptics';
import { decideSwipe, isEdgeStart, isSwipeBlockedTarget, resolveSwipeTarget } from '@/lib/swipe';
import { preloadTabPages } from './lazyPages';
import { TABS, tabIndexForPath } from './paths';
import { ScreenLayer } from './ScreenLayer';
import { tabVariants, type TransitionCustom } from './transitions';
import { useNavDirection } from './useNavDirection';

const TAB_BAR_ITEMS: readonly HomiTabBarItem[] = TABS.map((tab) => ({
  key: tab.key,
  label: tab.label,
  icon: tab.icon,
  to: tab.path,
}));

interface SwipeStart {
  pointerId: number;
  x: number;
  y: number;
}

/**
 * Layout route for the four tab screens: renders the active tab page, the Liquid Glass tab
 * bar and handles the horizontal swipe between neighbouring tabs.
 *
 * Swipe rules (see lib/swipe.ts): touch/pen only; ignored when starting within 24 px of the
 * screen edges (Safari back/forward gesture), on form fields, `[data-no-swipe]` or inside
 * horizontally scrollable areas; requires |dx| > 60 px and |dx| > 1.5·|dy|.
 */
export function TabShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const outlet = useOutlet();
  const reducedMotion = useReducedMotion() ?? false;
  const swipeStart = useRef<SwipeStart | null>(null);
  const pagesRef = useRef<HTMLDivElement>(null);

  const activeIndex = Math.max(0, tabIndexForPath(location.pathname));
  const activeTab = TABS[activeIndex] ?? TABS[0];
  const activeKey = activeTab?.key ?? 'home';
  const direction = useNavDirection(activeKey, activeIndex, navigationType);
  const custom: TransitionCustom = { direction, reducedMotion };

  useEffect(() => {
    preloadTabPages();
  }, []);

  const goToTab = useCallback(
    (index: number) => {
      const tab = TABS[index];
      if (!tab) return;
      haptic('selection');
      // Tabs are siblings, not history: switching replaces the entry (like iOS).
      void navigate(tab.path, { replace: true });
    },
    [navigate],
  );

  const scrollActivePageToTop = useCallback(() => {
    const scroller = pagesRef.current?.querySelector<HTMLElement>(
      '.tab-shell__page:not([data-exiting]) [data-screen-scroll]',
    );
    scroller?.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [reducedMotion]);

  const onSelectTab = useCallback(
    (key: string, event: MouseEvent<HTMLAnchorElement>) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (key === activeKey) {
        scrollActivePageToTop();
        return;
      }
      goToTab(TABS.findIndex((tab) => tab.key === key));
    },
    [activeKey, goToTab, scrollActivePageToTop],
  );

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === 'mouse' || !event.isPrimary) {
      swipeStart.current = null;
      return;
    }
    if (isEdgeStart(event.clientX, window.innerWidth) || isSwipeBlockedTarget(event.target, event.currentTarget)) {
      swipeStart.current = null;
      return;
    }
    swipeStart.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const swipe = decideSwipe({
      startX: start.x,
      startY: start.y,
      endX: event.clientX,
      endY: event.clientY,
      viewportWidth: window.innerWidth,
    });
    if (!swipe) return;
    const target = resolveSwipeTarget(activeIndex, TABS.length, swipe);
    if (target !== null) goToTab(target);
  };

  const onPointerCancel = (): void => {
    // The browser took over (vertical scroll, pinch zoom) – not a tab swipe.
    swipeStart.current = null;
  };

  return (
    <div className="tab-shell">
      <div
        ref={pagesRef}
        className="tab-shell__pages"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <AnimatePresence initial={false} custom={custom}>
          <ScreenLayer
            key={activeKey}
            className="tab-shell__page"
            variants={tabVariants}
            custom={custom}
            resetKey={activeKey}
            scrollKey={`tab:${activeKey}`}
          >
            {outlet}
          </ScreenLayer>
        </AnimatePresence>
      </div>
      <HomiTabBar items={TAB_BAR_ITEMS} activeKey={activeKey} onSelect={onSelectTab} />
    </div>
  );
}
