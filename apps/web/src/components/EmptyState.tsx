import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/icons/Icon';
import { cx } from './utils';

export interface EmptyStateProps {
  /** 36 px accent glyph in the 72 px accent-soft circle (design: tray, checkCircle, bubbles). */
  icon?: IconName;
  title: string;
  message?: ReactNode;
  /** Call to action (e.g. `<Button size="medium">`), 26 px below the message. */
  action?: ReactNode;
  /** Grow and centre vertically in the remaining screen height. */
  fill?: boolean;
  className?: string;
}

/**
 * Empty state (screens 10–12): 72 px accent-soft circle with a 36 px accent icon (1.7 px line),
 * `title3` title 20 px below, `subhead` label-secondary message (max. 313 px) 5 px below,
 * optional 200 × 48 pill button 26 px below.
 */
export function EmptyState({ icon, title, message, action, fill = false, className }: EmptyStateProps) {
  return (
    <section className={cx('homi-empty', className)} data-fill={fill || undefined}>
      {icon ? (
        <span className="homi-empty__icon" aria-hidden="true">
          <Icon name={icon} size={36} strokeWidth={1.13} />
        </span>
      ) : null}
      <h2 className="homi-empty__title">{title}</h2>
      {message ? <p className="homi-empty__message">{message}</p> : null}
      {action ? <div className="homi-empty__action">{action}</div> : null}
    </section>
  );
}
