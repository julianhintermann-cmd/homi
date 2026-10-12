import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useScrollContainer } from '@/hooks/useScrollMemory';
import { cx } from './utils';

export interface LargeTitleHeaderProps {
  title: string;
  /** `subhead` label-secondary line under the title (e.g. "128 Artikel in deinem Haushalt"). */
  subtitle?: ReactNode;
  /** Small line above the title (Home: "Guten Morgen"). Switches to the Home header layout. */
  eyebrow?: ReactNode;
  /** Leading glass control (e.g. back `GlassButton`), 16 px from the left edge. */
  leading?: ReactNode;
  /** Trailing glass controls (`GlassToolbar`, `ProfileButton`), right-aligned to the 20 px gutter. */
  trailing?: ReactNode;
  /** Extra row under the title/subtitle (Home: household switcher). */
  accessory?: ReactNode;
  /** id for `aria-labelledby` on the surrounding screen. */
  titleId?: string;
  className?: string;
}

/**
 * Large-title navigation header (FIDELITY §4.2).
 *
 * Standard layout (02, 03, 04, 10–12…): floating glass toolbar row at safe-top + 4 (h 44),
 * large title at safe-top + 52, optional subtitle at safe-top + 94. The toolbar row stays fixed
 * while the content (and the title) scroll under it; once the title is gone a compact inline
 * title fades in.
 *
 * Home layout (`eyebrow`): greeting at safe-top + 8, title at safe-top + 28, trailing control
 * (Profile Button) aligned with the greeting, accessory 7 px under the title.
 */
export function LargeTitleHeader({
  title,
  subtitle,
  eyebrow,
  leading,
  trailing,
  accessory,
  titleId,
  className,
}: LargeTitleHeaderProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const collapsed = useTitleCollapsed(titleRef, eyebrow === undefined);

  if (eyebrow !== undefined) {
    return (
      <header className={cx('homi-large-header homi-large-header--home', className)}>
        <div className="homi-large-header__eyebrow-row">
          <p className="homi-large-header__eyebrow">{eyebrow}</p>
          {trailing ? <div className="homi-large-header__home-trailing">{trailing}</div> : null}
        </div>
        <h1 ref={titleRef} id={titleId} className="homi-large-header__title">
          {title}
        </h1>
        {subtitle ? <p className="homi-large-header__subtitle">{subtitle}</p> : null}
        {accessory ? (
          <div className="homi-large-header__accessory homi-large-header__accessory--home">{accessory}</div>
        ) : null}
      </header>
    );
  }

  return (
    <header className={cx('homi-large-header', className)}>
      <div className="homi-nav-bar" data-collapsed={collapsed || undefined}>
        <div className="homi-nav-bar__leading">{leading}</div>
        <p className="homi-nav-bar__inline-title" aria-hidden="true">
          {title}
        </p>
        <div className="homi-nav-bar__trailing">{trailing}</div>
      </div>
      <div className="homi-nav-bar__spacer" aria-hidden="true" />
      <h1 ref={titleRef} id={titleId} className="homi-large-header__title">
        {title}
      </h1>
      {subtitle ? <p className="homi-large-header__subtitle">{subtitle}</p> : null}
      {accessory ? <div className="homi-large-header__accessory">{accessory}</div> : null}
    </header>
  );
}

/**
 * `true` while the large title has scrolled under the floating toolbar row. Reads layout only
 * inside a rAF after scroll events (no writes → no layout thrashing).
 */
function useTitleCollapsed(titleRef: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const container = useScrollContainer();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    const scroller = container?.current ?? null;
    const target: HTMLElement | Window = scroller ?? window;
    let frame = 0;
    const measure = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const title = titleRef.current;
        if (!title) return;
        const bar = title.parentElement?.querySelector<HTMLElement>('.homi-nav-bar');
        if (!bar) return;
        setCollapsed(title.getBoundingClientRect().bottom <= bar.getBoundingClientRect().bottom);
      });
    };
    measure();
    target.addEventListener('scroll', measure, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      target.removeEventListener('scroll', measure);
    };
  }, [container, enabled, titleRef]);

  return collapsed;
}
