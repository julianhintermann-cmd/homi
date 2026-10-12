import type { ReactNode } from 'react';
import { cx } from './utils';

export type ChatBubbleDirection = 'incoming' | 'outgoing';

export interface ChatBubbleProps {
  direction: ChatBubbleDirection;
  children: ReactNode;
  /** Sender/time line under the bubble ("Lisa · 13:48", `caption2` label-tertiary). */
  meta?: ReactNode;
  /** `sending`: optimistic message (dimmed); `failed`: shows `failedLabel` + retry. */
  status?: 'sent' | 'sending' | 'failed';
  onRetry?: () => void;
  className?: string;
}

/**
 * Freegma "Chat Bubble": padding 10/15, text 16/1.33, radii 20 with a 6 px tail corner
 * (incoming: bottom-left, surface-muted; outgoing: bottom-right, accent with on-accent text).
 * Max width min(322 px, column − 39 px) = 322 px on a 393 px screen; the list aligns incoming at 16 px, outgoing to 16 px from the right.
 */
export function ChatBubble({ direction, children, meta, status = 'sent', onRetry, className }: ChatBubbleProps) {
  return (
    <div className={cx('homi-chat-message', className)} data-direction={direction} data-status={status}>
      <div className="homi-chat-bubble" data-direction={direction}>
        <p className="homi-chat-bubble__text">{children}</p>
      </div>
      {status === 'failed' ? (
        <p className="homi-chat-message__failed" role="alert">
          Nicht gesendet.{' '}
          {onRetry ? (
            <button type="button" className="homi-text-button" data-tone="destructive" onClick={onRetry}>
              Erneut senden
            </button>
          ) : null}
        </p>
      ) : meta ? (
        <p className="homi-chat-message__meta">{meta}</p>
      ) : null}
    </div>
  );
}

/** Centred `caption` label-tertiary timestamp ("Heute, 08:12"). */
export function ChatTimestamp({ children }: { children: ReactNode }) {
  return <p className="homi-chat-timestamp">{children}</p>;
}

/** Right-aligned "Gelesen" read receipt, 6 px under the last outgoing message. */
export function ChatReadReceipt({ children = 'Gelesen' }: { children?: ReactNode }) {
  return <p className="homi-chat-receipt">{children}</p>;
}

/** "1 neue Nachricht" divider: two 116 px hairlines with a centred accent label (12 / 600). */
export function UnreadDivider({ count }: { count: number }) {
  const label = count === 1 ? '1 neue Nachricht' : `${count} neue Nachrichten`;
  return (
    <div className="homi-unread-divider" role="separator" aria-label={label}>
      <span className="homi-unread-divider__line" aria-hidden="true" />
      <span className="homi-unread-divider__label" aria-hidden="true">
        {label}
      </span>
      <span className="homi-unread-divider__line" aria-hidden="true" />
    </div>
  );
}
