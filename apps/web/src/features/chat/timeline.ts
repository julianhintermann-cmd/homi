import type { ConversationDto, MessageDto, MessageKind, ReadState, ShoppingItemMessageMeta } from '@homi/shared';
import { formatChatDayLabel, formatTime, type DateFormatOptions } from '@/lib/format';

/*
 * Pure chat timeline logic (no React): ordering, optimistic reconciliation, day separators,
 * grouping gaps, the unread divider and read receipts. Covered by timeline.test.ts.
 */

// ---------------------------------------------------------------------------
// Sequence numbers (BIGINT strings)
// ---------------------------------------------------------------------------

/** Compares two `seq` strings numerically (they can exceed `Number.MAX_SAFE_INTEGER`). */
export function compareSeq(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function maxSeq(a: string, b: string): string {
  return compareSeq(a, b) >= 0 ? a : b;
}

/**
 * Merges server messages: dedupes by id (later copies win), sorts ascending by `seq`.
 * Used for realtime inserts, acks and history pages alike.
 */
export function mergeMessages(existing: readonly MessageDto[], incoming: readonly MessageDto[]): MessageDto[] {
  if (incoming.length === 0) return [...existing];
  const byId = new Map<string, MessageDto>();
  for (const message of existing) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => compareSeq(a.seq, b.seq));
}

// ---------------------------------------------------------------------------
// Optimistic messages
// ---------------------------------------------------------------------------

export type DeliveryStatus = 'sent' | 'sending' | 'failed';

/** A message as rendered: confirmed by the server or still in the local outbox. */
export interface DisplayMessage {
  /** Stable React key across the optimistic → confirmed transition. */
  key: string;
  id: string | null;
  seq: string | null;
  clientId: string;
  senderId: string | null;
  senderName: string | null;
  kind: MessageKind;
  content: string;
  meta: ShoppingItemMessageMeta | null;
  createdAt: string;
  status: DeliveryStatus;
  /** Why sending failed (German, user-facing). */
  error?: string;
}

/** Local outbox entry (see outbox.ts) – the subset the timeline needs. */
export interface PendingMessage {
  clientId: string;
  conversationId: string;
  kind: MessageKind;
  content: string;
  meta: ShoppingItemMessageMeta | null;
  createdAt: string;
  status: 'sending' | 'failed';
  error?: string;
}

export function messageKey(senderId: string | null, clientId: string): string {
  return `${senderId ?? 'system'}:${clientId}`;
}

export function toDisplayMessage(message: MessageDto): DisplayMessage {
  return {
    key: messageKey(message.sender?.id ?? null, message.clientId),
    id: message.id,
    seq: message.seq,
    clientId: message.clientId,
    senderId: message.sender?.id ?? null,
    senderName: message.sender?.displayName ?? null,
    kind: message.kind,
    content: message.content,
    meta: message.meta,
    createdAt: message.createdAt,
    status: 'sent',
  };
}

/**
 * Confirmed messages (ascending) followed by the caller's still-pending messages. A pending
 * message disappears as soon as the server copy with the same `clientId` exists – whether it
 * arrived via the ack, the `chat:message` event or a refetch.
 */
export function reconcileMessages(
  confirmed: readonly MessageDto[],
  pending: readonly PendingMessage[],
  me: { id: string; displayName: string },
): DisplayMessage[] {
  const confirmedClientIds = new Set(
    confirmed.filter((message) => message.sender?.id === me.id).map((message) => message.clientId),
  );
  const display = confirmed.map(toDisplayMessage);
  const waiting = pending
    .filter((entry) => !confirmedClientIds.has(entry.clientId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const entry of waiting) {
    display.push({
      key: messageKey(me.id, entry.clientId),
      id: null,
      seq: null,
      clientId: entry.clientId,
      senderId: me.id,
      senderName: me.displayName,
      kind: entry.kind,
      content: entry.content,
      meta: entry.meta,
      createdAt: entry.createdAt,
      status: entry.status,
      error: entry.error,
    });
  }
  return display;
}

// ---------------------------------------------------------------------------
// Unread divider & read receipts
// ---------------------------------------------------------------------------

export interface UnreadMarker {
  /** `seq` of the first unread message (the divider sits right above it). */
  seq: string;
  count: number;
}

/**
 * Where the "1 neue Nachricht" divider goes when a conversation is opened: before the first
 * message of someone else that is newer than the caller's read cursor. `null` = all read.
 */
export function findUnreadMarker(
  messages: readonly MessageDto[],
  myId: string,
  myLastReadSeq: string | null,
): UnreadMarker | null {
  const cursor = myLastReadSeq ?? '0';
  const unread = messages.filter((message) => message.sender?.id !== myId && compareSeq(message.seq, cursor) > 0);
  const first = unread[0];
  return first ? { seq: first.seq, count: unread.length } : null;
}

export function unreadDividerLabel(count: number): string {
  return count === 1 ? '1 neue Nachricht' : `${count} neue Nachrichten`;
}

/**
 * Read receipt for the caller's newest confirmed message: "Gelesen" once every other member's
 * cursor reached it; in group chats "Gelesen von Lisa" / "Gelesen von Lisa und Max" while only
 * some did. `null` while nobody has read it yet.
 */
export function readReceiptLabel(
  messageSeq: string,
  members: readonly ReadState[],
  myId: string,
  memberNames: ReadonlyMap<string, string>,
): string | null {
  const others = members.filter((member) => member.userId !== myId);
  if (others.length === 0) return null;
  const readers = others.filter((member) => compareSeq(member.lastReadSeq, messageSeq) >= 0);
  if (readers.length === 0) return null;
  if (readers.length === others.length) return 'Gelesen';
  const names = readers.map((member) => memberNames.get(member.userId) ?? 'Jemand');
  if (names.length === 1) return `Gelesen von ${names[0]}`;
  if (names.length === 2) return `Gelesen von ${names[0]} und ${names[1]}`;
  return `Gelesen von ${names[0]} und ${names.length - 1} weiteren`;
}

// ---------------------------------------------------------------------------
// Timeline rows
// ---------------------------------------------------------------------------

/** Vertical rhythm (design 08/08b, FIDELITY §4.3/§4.5). */
export const GAP = {
  /** Different sender (bubble → bubble). */
  senderChange: 11,
  /** Same sender, consecutive bubbles. */
  sameSender: 4,
  /** Same sender, bubble ↔ shared-item card. */
  sameSenderCard: 7,
  /** Timestamp / unread divider → message. */
  afterMarker: 12,
  /** Message (incl. its receipt/meta line) → unread divider. */
  beforeDivider: 14,
  /** Message → timestamp separator. */
  beforeSeparator: 20,
} as const;

export type TimelineRow =
  | { type: 'separator'; key: string; label: string; gap: number }
  | { type: 'unread'; key: string; count: number; gap: number }
  | {
      type: 'message';
      key: string;
      message: DisplayMessage;
      direction: 'incoming' | 'outgoing';
      gap: number;
      /** "Lisa · 13:48" under incoming messages. */
      meta: string | null;
      /** "Gelesen" under the caller's newest confirmed message. */
      receipt: string | null;
    };

export interface TimelineOptions {
  myId: string;
  conversationType: ConversationDto['type'];
  members: readonly ReadState[];
  memberNames: ReadonlyMap<string, string>;
  unread: UnreadMarker | null;
  dateOptions?: DateFormatOptions;
}

export function separatorLabel(createdAt: string, dateOptions?: DateFormatOptions): string {
  return `${formatChatDayLabel(createdAt, dateOptions)}, ${formatTime(createdAt, dateOptions)}`;
}

/** Timestamp separators start the conversation and every new calendar day (design 08/08b). */
function startsNewSection(previous: DisplayMessage | undefined, current: DisplayMessage, options: TimelineOptions) {
  if (!previous) return true;
  return (
    formatChatDayLabel(previous.createdAt, options.dateOptions) !==
    formatChatDayLabel(current.createdAt, options.dateOptions)
  );
}

/**
 * Turns messages into rows: timestamp separators (first message, new day), the
 * unread divider, the gap above each row, sender meta and the read receipt.
 */
export function buildTimeline(messages: readonly DisplayMessage[], options: TimelineOptions): TimelineRow[] {
  const rows: TimelineRow[] = [];
  const isGroup = options.conversationType === 'HOUSEHOLD';

  // The receipt belongs to the newest confirmed outgoing message.
  let receiptKey: string | null = null;
  let receipt: string | null = null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && message.senderId === options.myId && message.status === 'sent' && message.seq) {
      receiptKey = message.key;
      receipt = readReceiptLabel(message.seq, options.members, options.myId, options.memberNames);
      break;
    }
  }

  let previous: DisplayMessage | undefined;
  let previousRow: TimelineRow | undefined;
  messages.forEach((message, index) => {
    const next = messages[index + 1];
    const outgoing = message.senderId === options.myId;
    const markerBefore = options.unread !== null && message.seq === options.unread.seq;
    const newSection = startsNewSection(previous, message, options);

    if (markerBefore && options.unread) {
      const row: TimelineRow = {
        type: 'unread',
        key: `unread:${options.unread.seq}`,
        count: options.unread.count,
        gap: previousRow ? GAP.beforeDivider : 0,
      };
      rows.push(row);
      previousRow = row;
    }
    if (newSection) {
      const row: TimelineRow = {
        type: 'separator',
        key: `separator:${message.key}`,
        label: separatorLabel(message.createdAt, options.dateOptions),
        gap: !previousRow ? 0 : previousRow.type === 'unread' ? GAP.afterMarker : GAP.beforeSeparator,
      };
      rows.push(row);
      previousRow = row;
    }

    let gap: number;
    if (!previousRow) gap = 0;
    else if (previousRow.type !== 'message') gap = GAP.afterMarker;
    else if (previousRow.message.senderId !== message.senderId) gap = GAP.senderChange;
    else if (previousRow.message.kind === 'SHOPPING_ITEM' || message.kind === 'SHOPPING_ITEM') gap = GAP.sameSenderCard;
    else gap = GAP.sameSender;
    // A receipt or meta line under the previous message ends its group.
    if (previousRow?.type === 'message' && (previousRow.receipt || previousRow.meta)) {
      gap = Math.max(gap, GAP.senderChange);
    }

    // Sender meta: group chats under the last bubble of every incoming run; direct chats only
    // under an incoming message that is the newest of the conversation (design 08b).
    const nextStartsSection = next ? startsNewSection(message, next, options) : true;
    const endsRun = !next || next.senderId !== message.senderId || nextStartsSection;
    let meta: string | null = null;
    if (!outgoing && endsRun && (isGroup || !next)) {
      const time = formatTime(message.createdAt, options.dateOptions);
      meta = `${message.senderName ?? 'Ehemaliges Mitglied'} · ${time}`;
    }

    const row: TimelineRow = {
      type: 'message',
      key: message.key,
      message,
      direction: outgoing ? 'outgoing' : 'incoming',
      gap,
      meta,
      receipt: message.key === receiptKey ? receipt : null,
    };
    rows.push(row);
    previousRow = row;
    previous = message;
  });

  return rows;
}

// ---------------------------------------------------------------------------
// Conversation list helpers
// ---------------------------------------------------------------------------

/** Preview line of a conversation row ("Lisa: Ich habe …" in group chats). */
export function conversationPreview(conversation: ConversationDto, myId: string): string {
  const last = conversation.lastMessage;
  if (!last) return '';
  const text = last.kind === 'SHOPPING_ITEM' ? `Zur Einkaufsliste: ${last.content}` : last.content;
  const flat = text.replace(/\s+/g, ' ').trim();
  if (last.sender?.id === myId) return `Du: ${flat}`;
  if (conversation.type === 'HOUSEHOLD') return `${last.sender?.displayName ?? 'Ehemaliges Mitglied'}: ${flat}`;
  return flat;
}

/** Client-side search over title and preview (case- and accent-insensitive). */
export function filterConversations(
  conversations: readonly ConversationDto[],
  query: string,
  myId: string,
): ConversationDto[] {
  const needle = normalize(query);
  if (!needle) return [...conversations];
  return conversations.filter(
    (conversation) =>
      normalize(conversation.title).includes(needle) ||
      normalize(conversationPreview(conversation, myId)).includes(needle),
  );
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('de-CH')
    .trim();
}

/** Newest activity first; conversations without messages last (household chat first). */
export function sortConversations(conversations: readonly ConversationDto[]): ConversationDto[] {
  return [...conversations].sort((a, b) => {
    const aSeq = a.lastMessage?.seq ?? null;
    const bSeq = b.lastMessage?.seq ?? null;
    if (aSeq !== null && bSeq !== null) return compareSeq(bSeq, aSeq);
    if (aSeq === null && bSeq !== null) return 1;
    if (aSeq !== null && bSeq === null) return -1;
    if (a.type !== b.type) return a.type === 'HOUSEHOLD' ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

/**
 * Applies a realtime message to a cached conversation list. Returns `null` when the
 * conversation is unknown (the caller refetches the list).
 */
export function applyMessageToConversations(
  conversations: readonly ConversationDto[],
  message: MessageDto,
  myId: string,
): ConversationDto[] | null {
  const index = conversations.findIndex((conversation) => conversation.id === message.conversationId);
  const current = conversations[index];
  if (!current) return null;
  const isNewer = !current.lastMessage || compareSeq(message.seq, current.lastMessage.seq) > 0;
  if (!isNewer) return [...conversations];
  const fromOther = message.sender?.id !== myId;
  const updated: ConversationDto = {
    ...current,
    lastMessage: message,
    updatedAt: message.createdAt,
    unreadCount: fromOther ? current.unreadCount + 1 : 0,
  };
  const next = [...conversations];
  next[index] = updated;
  return sortConversations(next);
}

/** The caller's own read cursor moved: clear the badge when it covers the newest message. */
export function applyOwnReadToConversations(
  conversations: readonly ConversationDto[],
  conversationId: string,
  seq: string,
): { conversations: ConversationDto[]; exact: boolean } {
  let exact = true;
  const next = conversations.map((conversation) => {
    if (conversation.id !== conversationId || conversation.unreadCount === 0) return conversation;
    if (conversation.lastMessage && compareSeq(seq, conversation.lastMessage.seq) >= 0) {
      return { ...conversation, unreadCount: 0 };
    }
    exact = false;
    return conversation;
  });
  return { conversations: next, exact };
}
