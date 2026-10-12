import type { MouseEventHandler, ReactNode } from 'react';
import { Link } from 'react-router';
import { cx, enableActiveStates } from './utils';

enableActiveStates();

export interface ConversationRowProps {
  title: string;
  /** 54 px avatar (`Avatar size={54}`; household chats: `household`). */
  avatar: ReactNode;
  /** Already formatted ("14:32", "Gestern"). */
  time?: string;
  /** Last message preview ("Lisa: Ich habe …"). */
  preview?: string;
  unreadCount?: number;
  to?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  /** Root wrapper: `li` (default) or `div`. */
  wrapper?: 'li' | 'div';
  className?: string;
}

/**
 * Freegma "Message Preview Row" (353 × 84, on the screen background – no card): 54 px avatar,
 * `headline` title, right-aligned time; unread rows get an accent 600 time, the preview in label
 * colour over up to two lines and a 22 px accent badge. Separator from x 68.
 */
export function ConversationRow({
  title,
  avatar,
  time,
  preview,
  unreadCount = 0,
  to,
  onClick,
  wrapper = 'li',
  className,
}: ConversationRowProps) {
  const unread = unreadCount > 0;
  const badge = unreadCount > 99 ? '99+' : String(unreadCount);
  const unreadText = unreadCount === 1 ? '1 ungelesene Nachricht' : `${unreadCount} ungelesene Nachrichten`;
  const content = (
    <>
      <span className="homi-conversation-row__avatar">{avatar}</span>
      <span className="homi-conversation-row__body">
        <span className="homi-conversation-row__top">
          <span className="homi-conversation-row__title">{title}</span>
          {time ? <span className="homi-conversation-row__time">{time}</span> : null}
        </span>
        <span className="homi-conversation-row__bottom">
          {preview ? <span className="homi-conversation-row__preview">{preview}</span> : <span />}
          {unread ? (
            <span className="homi-conversation-row__badge">
              <span aria-hidden="true">{badge}</span>
              <span className="visually-hidden">{unreadText}</span>
            </span>
          ) : null}
        </span>
      </span>
    </>
  );
  const accessibleName = [title, unread ? unreadText : null, time, preview].filter(Boolean).join(', ');
  const rowProps = {
    'aria-label': accessibleName,
    className: cx('homi-conversation-row', className),
    'data-unread': unread || undefined,
  };
  const Wrapper = wrapper;
  return (
    <Wrapper className="homi-row-item">
      {to !== undefined ? (
        <Link to={to} onClick={onClick} {...rowProps}>
          {content}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} {...rowProps}>
          {content}
        </button>
      ) : (
        <div className={rowProps.className} data-unread={rowProps['data-unread']}>
          {content}
        </div>
      )}
    </Wrapper>
  );
}
