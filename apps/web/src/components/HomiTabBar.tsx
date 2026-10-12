import type { CSSProperties, MouseEvent } from 'react';
import { Link } from 'react-router';
import { Icon, type IconName } from '@/icons/Icon';
import { cx, enableActiveStates } from './utils';

enableActiveStates();

export interface HomiTabBarItem {
  key: string;
  label: string;
  icon: IconName;
  /** Route path of the tab root. */
  to: string;
  /** Optional unread/attention count shown as a badge. */
  badge?: number;
}

export interface HomiTabBarProps {
  items: readonly HomiTabBarItem[];
  activeKey: string;
  /**
   * Called on every tab press (also when re-pressing the active tab) *before* the link
   * navigates. TabShell calls `event.preventDefault()` and navigates itself (replace,
   * haptics, scroll-to-top on re-press) – the tabs stay real links.
   */
  onSelect?: (key: string, event: MouseEvent<HTMLAnchorElement>) => void;
  /** Render in normal flow instead of fixed to the viewport bottom (design gallery). */
  inline?: boolean;
  className?: string;
}

/**
 * Freegma "Tab Bar (Liquid Glass)": floating glass capsule 361 × 62 (r 31) inset 16 px,
 * bottom = max(21 px, safe-area − 13 px). Four 88.25 × 54 tabs; the selected tab gets the
 * lens (black 6 % / white 10 %, r 27) that slides between tabs, accent icon (2.0 stroke) and
 * accent label; the others use the label colour with a 1.7 stroke (FIDELITY §2.1).
 */
export function HomiTabBar({ items, activeKey, onSelect, inline = false, className }: HomiTabBarProps) {
  const activeIndex = items.findIndex((item) => item.key === activeKey);
  const style = {
    '--tab-count': String(Math.max(1, items.length)),
    '--tab-index': String(Math.max(0, activeIndex)),
  } as CSSProperties;

  return (
    <nav
      aria-label="Hauptnavigation"
      data-no-swipe
      data-inline={inline || undefined}
      className={cx('glass homi-tabbar', className)}
      style={style}
    >
      {activeIndex >= 0 ? <span className="homi-tabbar__lens" aria-hidden="true" /> : null}
      {items.map((item) => {
        const active = item.key === activeKey;
        const badge = item.badge && item.badge > 0 ? item.badge : 0;
        return (
          <Link
            key={item.key}
            to={item.to}
            aria-current={active ? 'page' : undefined}
            data-active={active || undefined}
            className="homi-tabbar__item"
            draggable={false}
            onClick={(event) => onSelect?.(item.key, event)}
          >
            <span className="homi-tabbar__icon">
              <Icon name={item.icon} size={24} strokeWidth={active ? 2 : 1.7} />
              {badge ? (
                <span className="homi-tabbar__badge" aria-hidden="true">
                  {badge > 99 ? '99+' : badge}
                </span>
              ) : null}
            </span>
            <span className="homi-tabbar__label">{item.label}</span>
            {badge ? <span className="visually-hidden">{`, ${badge} ungelesen`}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
