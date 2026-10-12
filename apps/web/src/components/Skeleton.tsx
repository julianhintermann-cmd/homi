import type { CSSProperties } from 'react';
import { cx } from './utils';

export interface SkeletonProps {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  radius?: CSSProperties['borderRadius'];
  /** `circle` makes width = height with a full radius. */
  shape?: 'block' | 'circle' | 'text';
  className?: string;
  style?: CSSProperties;
}

/**
 * Loading placeholder: surface-muted block with a soft shimmer (a transform-animated highlight;
 * static under reduced motion). Decorative – announce loading via the surrounding `aria-busy`.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  radius = 'var(--radius-xs)',
  shape = 'block',
  className,
  style,
}: SkeletonProps) {
  const circle = shape === 'circle';
  return (
    <span
      aria-hidden="true"
      className={cx('homi-skeleton', className)}
      data-shape={shape}
      style={{
        width: circle ? height : width,
        height,
        borderRadius: circle ? '50%' : shape === 'text' ? 'var(--radius-pill)' : radius,
        ...style,
      }}
    />
  );
}

export interface SkeletonListProps {
  /** Row shape to mimic. */
  variant: 'inventory' | 'shopping' | 'conversation' | 'settings';
  /** Number of rows. Default 4. */
  rows?: number;
  className?: string;
  /** Accessible loading label. Default "Wird geladen …". */
  label?: string;
}

/** Skeleton rows that match the real row geometry (no layout jump when data arrives). */
export function SkeletonList({ variant, rows = 4, className, label = 'Wird geladen …' }: SkeletonListProps) {
  const items = Array.from({ length: rows }, (_, index) => index);
  const inCard = variant !== 'conversation';
  return (
    <div
      className={cx('homi-skeleton-list', inCard && 'homi-card', className)}
      data-variant={variant}
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      {items.map((index) => (
        <div key={index} className="homi-skeleton-row" data-variant={variant}>
          {variant === 'inventory' ? (
            <>
              <Skeleton width={52} height={52} radius={12} />
              <span className="homi-skeleton-row__lines">
                <Skeleton shape="text" width={`${55 - (index % 3) * 8}%`} height={14} />
                <Skeleton shape="text" width="38%" height={11} />
              </span>
              <span className="homi-skeleton-row__trailing">
                <Skeleton shape="text" width={64} height={13} />
                <Skeleton shape="text" width={88} height={11} />
              </span>
            </>
          ) : null}
          {variant === 'shopping' ? (
            <>
              <Skeleton shape="circle" height={26} />
              <Skeleton shape="text" width={`${42 - (index % 3) * 6}%`} height={14} />
              <Skeleton shape="text" width={56} height={12} className="homi-skeleton-row__push" />
            </>
          ) : null}
          {variant === 'conversation' ? (
            <>
              <Skeleton shape="circle" height={54} />
              <span className="homi-skeleton-row__lines">
                <Skeleton shape="text" width={`${40 - (index % 2) * 10}%`} height={14} />
                <Skeleton shape="text" width="72%" height={12} />
              </span>
            </>
          ) : null}
          {variant === 'settings' ? (
            <>
              <Skeleton width={30} height={30} radius={8} />
              <Skeleton shape="text" width="46%" height={14} />
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}
