import type { ReactNode } from 'react';
import { useScrolled } from './useScrolled';
import { cx } from './utils';

/**
 * Scroll-edge overlays (iOS 26 "Scroll Edge Effect", FIDELITY §4.5 / §8.3):
 * - `tabbar`: bottom fade from 27 px above the tab bar (design: 393 × 110 at y 742) plus a
 *   short top fade behind the status bar that appears once the content is scrolled.
 * - `chat`: bottom fade 152 px behind the composer (the matching 150 px top fade belongs to
 *   `InlineHeader`'s contact variant).
 * - `bottom`: bottom fade only, `none`: no overlays.
 */
export type ScreenEdges = 'tabbar' | 'chat' | 'bottom' | 'none';

export interface ScreenProps {
  children: ReactNode;
  /** Header rendered above the content (e.g. `LargeTitleHeader`, `InlineHeader`). */
  header?: ReactNode;
  /** Reserve space for the floating tab bar at the bottom (tab screens). */
  withTabBar?: boolean;
  /** Reserve space for a fixed `ChatComposer` at the bottom. */
  withComposer?: boolean;
  /** Scroll-edge overlays. Default: `tabbar` with a tab bar, `chat` with a composer, else `none`. */
  edges?: ScreenEdges;
  /** 20 px content gutter (design). Default `true`. */
  gutter?: boolean;
  className?: string;
  'aria-labelledby'?: string;
  'aria-label'?: string;
}

/**
 * Screen scaffold: background, safe areas and bottom clearance for the tab bar / composer.
 *
 * Not a scroll container itself – the navigation layer (`ScreenLayer`) is the scroll
 * container (scroll memory, scroll-to-top on tab re-press). Outside the navigation stack the
 * document scrolls.
 */
export function Screen({
  children,
  header,
  withTabBar = false,
  withComposer = false,
  edges,
  gutter = true,
  className,
  ...aria
}: ScreenProps) {
  const resolvedEdges: ScreenEdges = edges ?? (withComposer ? 'chat' : withTabBar ? 'tabbar' : 'none');
  return (
    <main
      className={cx('homi-screen', className)}
      data-tabbar={withTabBar || undefined}
      data-composer={withComposer || undefined}
      data-gutter={gutter || undefined}
      {...aria}
    >
      {header}
      {children}
      {resolvedEdges !== 'none' ? <ScreenEdgesOverlay edges={resolvedEdges} /> : null}
    </main>
  );
}

function ScreenEdgesOverlay({ edges }: { edges: Exclude<ScreenEdges, 'none'> }) {
  return (
    <>
      {edges === 'tabbar' ? <ScrollEdge position="top" variant="status" /> : null}
      <ScrollEdge position="bottom" variant={edges === 'chat' ? 'chat' : 'tabbar'} />
    </>
  );
}

export interface ScrollEdgeProps {
  position: 'top' | 'bottom';
  /** `status`: short fade behind the status bar, only while scrolled. */
  variant?: 'tabbar' | 'chat' | 'status';
}

/** Fixed, non-interactive background-colour fade above the content and below glass chrome. */
export function ScrollEdge({ position, variant = 'tabbar' }: ScrollEdgeProps) {
  if (variant === 'status') return <StatusScrollEdge />;
  return <div className="homi-scroll-edge" data-position={position} data-variant={variant} aria-hidden="true" />;
}

function StatusScrollEdge() {
  const scrolled = useScrolled();
  return (
    <div
      className="homi-scroll-edge"
      data-position="top"
      data-variant="status"
      data-visible={scrolled || undefined}
      aria-hidden="true"
    />
  );
}
