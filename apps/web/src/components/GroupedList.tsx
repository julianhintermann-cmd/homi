import { useId, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from './utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Corner radius: `card` 22 (grouped lists, summary cards) or `small` 16 (form card, add row). */
  radius?: 'card' | 'small';
  /** Inner padding 20 (summary/value cards). Lists use rows with their own padding. */
  padded?: boolean;
}

/** Opaque content card (surface fill). Content stays on calm, opaque surfaces – never glass. */
export function Card({ radius = 'card', padded = false, className, ...rest }: CardProps) {
  return (
    <div className={cx('homi-card', className)} data-radius={radius} data-padded={padded || undefined} {...rest} />
  );
}

export interface GroupedListProps {
  children: ReactNode;
  /** Section label above the card (`footnote-medium` label-secondary, x + 4, 6 px above). */
  label?: ReactNode;
  /** Right-aligned action in the label row (e.g. "Leeren" – `footnote-medium` accent button). */
  action?: ReactNode;
  /** Hint under the card (`footnote` label-tertiary, 12 px below, x + 4). */
  footer?: ReactNode;
  /** Card radius (default 22). */
  radius?: 'card' | 'small';
  /** `list` (default) renders `<ul>` semantics – children must then be `<li>`s or `ListRow`s. */
  as?: 'list' | 'group';
  className?: string;
  'aria-label'?: string;
}

/**
 * Grouped card list (settings, members, shopping preview …): optional section label/action,
 * the rows on one rounded surface card, optional footnote. Row separators are inset per row type
 * and hidden after the last row.
 */
export function GroupedList({
  children,
  label,
  action,
  footer,
  radius = 'card',
  as = 'list',
  className,
  ...aria
}: GroupedListProps) {
  const labelId = useId();
  const labelledBy = label ? labelId : undefined;
  return (
    <section
      className={cx('homi-grouped', className)}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : aria['aria-label']}
    >
      {label || action ? (
        <div className="homi-grouped__header">
          {label ? (
            <h2 id={labelId} className="homi-section-label">
              {label}
            </h2>
          ) : (
            <span />
          )}
          {action ? <div className="homi-grouped__action">{action}</div> : null}
        </div>
      ) : null}
      {as === 'list' ? (
        <ul className="homi-card homi-grouped__card" data-radius={radius} role="list">
          {children}
        </ul>
      ) : (
        <div className="homi-card homi-grouped__card" data-radius={radius} role="group">
          {children}
        </div>
      )}
      {footer ? <p className="homi-grouped__footer">{footer}</p> : null}
    </section>
  );
}

export interface SectionHeaderProps {
  /** `title3` section title (Home: "Dein Inventar"). */
  title: ReactNode;
  /** Right-aligned `subhead-medium` accent link/button, 3 px lower (e.g. "Alle ansehen"). */
  action?: ReactNode;
  id?: string;
  className?: string;
}

/** Section header with a `title3` title and an optional accent action (FIDELITY §4.5). */
export function SectionHeader({ title, action, id, className }: SectionHeaderProps) {
  return (
    <div className={cx('homi-section-header', className)}>
      <h2 id={id} className="homi-section-header__title">
        {title}
      </h2>
      {action ? <div className="homi-section-header__action">{action}</div> : null}
    </div>
  );
}
