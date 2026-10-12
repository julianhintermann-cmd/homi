import type { ReactNode } from 'react';
import { cx } from './utils';

export interface StatProps {
  /** `title3` value, e.g. "128" or "8 Artikel". */
  value: ReactNode;
  /** `footnote` label-secondary caption, e.g. "Artikel im Haushalt". */
  label: ReactNode;
  className?: string;
}

/** Freegma "Dashboard Statistic" (150 × 52): value at y 0, label at y 30. */
export function Stat({ value, label, className }: StatProps) {
  return (
    <div className={cx('homi-stat', className)}>
      <span className="homi-stat__value">{value}</span>
      <span className="homi-stat__label">{label}</span>
    </div>
  );
}
