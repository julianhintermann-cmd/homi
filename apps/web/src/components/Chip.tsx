import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx, enableActiveStates } from './utils';

enableActiveStates();

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode;
  selected?: boolean;
}

/**
 * Freegma "Category Chip": 36 px pill (r 18), padding 8/16. Default: surface with a 1 px
 * separator ring, `subhead-medium` label. Selected: label-colour fill, no ring, 15/600 label in
 * the background colour. A toggle button (`aria-pressed`).
 */
export function Chip({ children, selected = false, type = 'button', className, ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      data-selected={selected || undefined}
      className={cx('homi-chip', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export interface ChipRowProps {
  children: ReactNode;
  /** Accessible name of the filter group, e.g. "Kategorie". */
  label: string;
  className?: string;
}

/**
 * Horizontally scrolling chip row (gap 8, bleeds to the screen edges, starts at the 20 px
 * gutter). Opts out of the tab swipe (`data-no-swipe`) and keeps the selected chip in view.
 */
export function ChipRow({ children, label, className }: ChipRowProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const row = ref.current;
    const selected = row?.querySelector<HTMLElement>('[data-selected]');
    if (!row || !selected) return;
    const rowBox = row.getBoundingClientRect();
    const chipBox = selected.getBoundingClientRect();
    if (chipBox.left < rowBox.left + 20 || chipBox.right > rowBox.right - 20) {
      row.scrollTo({ left: row.scrollLeft + chipBox.left - rowBox.left - 20, behavior: 'smooth' });
    }
  });

  return (
    <div ref={ref} className={cx('homi-chip-row', className)} role="group" aria-label={label} data-no-swipe>
      {children}
    </div>
  );
}
