import type { MouseEventHandler } from 'react';
import { Link } from 'react-router';
import { Icon, type IconName } from '@/icons/Icon';
import { cx, enableActiveStates } from './utils';

enableActiveStates();

export interface SharedItemCardProps {
  /** "Milch · 2 Liter" (`subhead-medium`). */
  title: string;
  /** "Zur Einkaufsliste hinzugefügt" (12 / 400 label-secondary). */
  status: string;
  icon?: IconName;
  /** Outgoing cards are right-aligned like outgoing bubbles. */
  direction?: 'incoming' | 'outgoing';
  to?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  className?: string;
}

/**
 * Chat card for `MessageKind.SHOPPING_ITEM` (design 08): 244 × 60, r 18, surface with a 1 px
 * separator ring; 36 px accent-soft icon tile (r 10) with the 20 px accent cart.
 */
export function SharedItemCard({
  title,
  status,
  icon = 'cart',
  direction = 'outgoing',
  to,
  onClick,
  className,
}: SharedItemCardProps) {
  const content = (
    <>
      <span className="homi-shared-card__icon" aria-hidden="true">
        <Icon name={icon} size={20} strokeWidth={2.28} />
      </span>
      <span className="homi-shared-card__text">
        <span className="homi-shared-card__title">{title}</span>
        <span className="homi-shared-card__status">{status}</span>
      </span>
    </>
  );
  const classes = cx('homi-shared-card', className);
  return (
    <div className="homi-chat-message" data-direction={direction}>
      {to !== undefined ? (
        <Link to={to} onClick={onClick} className={classes} data-interactive>
          {content}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={classes} data-interactive>
          {content}
        </button>
      ) : (
        <div className={classes}>{content}</div>
      )}
    </div>
  );
}
