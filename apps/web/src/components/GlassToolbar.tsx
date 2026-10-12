import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Icon, type IconName } from '@/icons/Icon';
import { cx, enableActiveStates } from './utils';

enableActiveStates();

export interface GlassToolbarProps {
  /** 1–2 `GlassToolbarItem`s (design: plus + ellipsis, or a single ellipsis/compose). */
  children: ReactNode;
  /** Accessible name of the toolbar, e.g. "Inventar-Aktionen". */
  label?: string;
  className?: string;
}

/**
 * Freegma "Toolbar (Glass)": one glass capsule (h 44, r 22, 4 px side padding) grouping
 * 44 × 44 icon items – 52 px wide with one item, 96 px with two.
 */
export function GlassToolbar({ children, label, className }: GlassToolbarProps) {
  return (
    <div role="toolbar" aria-label={label} className={cx('glass homi-glass-toolbar', className)}>
      {children}
    </div>
  );
}

export interface GlassToolbarItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  /** Accessible label, e.g. "Artikel hinzufügen". */
  label: string;
  ref?: Ref<HTMLButtonElement>;
}

/** 44 × 44 item inside a `GlassToolbar` (icon 22 px; `ellipsis` is filled). */
export function GlassToolbarItem({ icon, label, type = 'button', className, title, ...rest }: GlassToolbarItemProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={title ?? label}
      className={cx('homi-glass-toolbar__item', className)}
      {...rest}
    >
      <Icon name={icon} size={22} strokeWidth={2.18} />
    </button>
  );
}
