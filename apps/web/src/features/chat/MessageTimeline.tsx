import { memo, type Ref } from 'react';
import { SHOPPING_ITEM_MESSAGE_STATUS, shoppingItemMessageTitle } from '@homi/shared';
import { ChatBubble, ChatReadReceipt, ChatTimestamp, SharedItemCard, UnreadDivider } from '@/components';
import { formatTime } from '@/lib/format';
import { paths } from '@/routes/paths';
import type { DisplayMessage, TimelineRow } from './timeline';

export interface MessageTimelineProps {
  rows: readonly TimelineRow[];
  onRetry: (clientId: string) => void;
  /** "Lisa schreibt …" under the newest message. */
  typingLabel?: string | null;
  ref?: Ref<HTMLOListElement>;
}

/**
 * Chat history (design 08/08b): timestamp separators, bubbles / shared-item cards with the
 * design's vertical rhythm (gap per row), the unread divider, sender meta and read receipt.
 * Rows carry `data-row-key` for scroll anchoring while older messages load.
 */
export function MessageTimeline({ rows, onRetry, typingLabel, ref }: MessageTimelineProps) {
  return (
    <div className="chat-timeline" role="log" aria-label="Nachrichten" aria-live="polite" aria-relevant="additions">
      <ol ref={ref} className="chat-timeline__list">
        {rows.map((row) => (
          <li
            key={row.key}
            className="chat-timeline__row"
            data-row-key={row.key}
            data-row-type={row.type}
            style={row.gap ? { marginTop: row.gap } : undefined}
          >
            {row.type === 'separator' ? (
              <ChatTimestamp>{row.label}</ChatTimestamp>
            ) : row.type === 'unread' ? (
              <UnreadDivider count={row.count} />
            ) : (
              <TimelineMessage
                message={row.message}
                direction={row.direction}
                meta={row.meta}
                receipt={row.receipt}
                onRetry={onRetry}
              />
            )}
          </li>
        ))}
      </ol>
      {typingLabel ? (
        <p className="homi-chat-message__meta chat-timeline__typing" aria-live="polite">
          {typingLabel}
        </p>
      ) : null}
    </div>
  );
}

interface TimelineMessageProps {
  message: DisplayMessage;
  direction: 'incoming' | 'outgoing';
  meta: string | null;
  receipt: string | null;
  onRetry: (clientId: string) => void;
}

const TimelineMessage = memo(function TimelineMessage({
  message,
  direction,
  meta,
  receipt,
  onRetry,
}: TimelineMessageProps) {
  const speaker = direction === 'outgoing' ? 'Du' : (message.senderName ?? 'Ehemaliges Mitglied');
  const spoken = `${speaker}, ${formatTime(message.createdAt)}: `;
  const retry = () => onRetry(message.clientId);

  if (message.kind === 'SHOPPING_ITEM') {
    const title = message.meta ? shoppingItemMessageTitle(message.meta) : message.content;
    return (
      <div className="chat-card" data-status={message.status}>
        <SharedItemCard
          title={title}
          status={SHOPPING_ITEM_MESSAGE_STATUS}
          direction={direction}
          to={message.status === 'sent' ? paths.shopping : undefined}
        />
        {message.status === 'failed' ? (
          <p className="homi-chat-message__failed chat-card__failed" role="alert">
            Nicht gesendet.{' '}
            <button type="button" className="homi-text-button" data-tone="destructive" onClick={retry}>
              Erneut senden
            </button>
          </p>
        ) : meta ? (
          <p className="homi-chat-message__meta">{meta}</p>
        ) : null}
        {receipt ? <ChatReadReceipt>{receipt}</ChatReadReceipt> : null}
      </div>
    );
  }

  return (
    <>
      <ChatBubble
        direction={direction}
        status={message.status}
        meta={meta ?? undefined}
        onRetry={message.status === 'failed' ? retry : undefined}
      >
        <span className="visually-hidden">{spoken}</span>
        {message.content}
      </ChatBubble>
      {receipt ? <ChatReadReceipt>{receipt}</ChatReadReceipt> : null}
    </>
  );
});
