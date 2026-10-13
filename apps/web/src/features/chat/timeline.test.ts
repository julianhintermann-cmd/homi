import { describe, expect, it } from 'vitest';
import type { ConversationDto, MessageDto, ReadState } from '@homi/shared';
import { shoppingItemMessageTitle } from '@homi/shared';
import {
  GAP,
  applyMessageToConversations,
  applyOwnReadToConversations,
  buildTimeline,
  compareSeq,
  conversationPreview,
  filterConversations,
  findUnreadMarker,
  mergeMessages,
  readReceiptLabel,
  reconcileMessages,
  sortConversations,
  type PendingMessage,
  type TimelineRow,
} from './timeline';

const ME = '11111111-1111-4111-8111-111111111111';
const LISA = '22222222-2222-4222-8222-222222222222';
const MAX = '33333333-3333-4333-8333-333333333333';
const CID = '44444444-4444-4444-8444-444444444444';
const TZ = { timeZone: 'Europe/Zurich', now: '2026-10-12T15:00:00+02:00' } as const;

let counter = 0;
function message(
  seq: number | string,
  sender: string | null,
  content: string,
  createdAt: string,
  extra = {},
): MessageDto {
  counter += 1;
  const names: Record<string, string> = { [ME]: 'Julian', [LISA]: 'Lisa', [MAX]: 'Max' };
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    seq: String(seq),
    conversationId: CID,
    sender: sender ? { id: sender, displayName: names[sender] ?? '?' } : null,
    kind: 'TEXT',
    content,
    meta: null,
    createdAt,
    clientId: `client-${counter}`,
    ...extra,
  };
}

/** The design-08b conversation (times in Europe/Zurich). */
function lisaConversation(): MessageDto[] {
  return [
    message(1, LISA, 'Hey, haben wir noch Kaffee zuhause?', '2026-10-12T08:12:00+02:00'),
    message(2, ME, 'Ja, wir haben noch zwei Packungen ☕', '2026-10-12T08:13:00+02:00'),
    message(3, LISA, 'Perfekt! Dann brauchen wir nur noch Milch.', '2026-10-12T08:14:00+02:00'),
    message(4, ME, 'Ich setze sie auf die Einkaufsliste.', '2026-10-12T08:15:00+02:00'),
    message(5, ME, 'Milch · 2 Liter', '2026-10-12T08:15:30+02:00', {
      kind: 'SHOPPING_ITEM',
      meta: { shoppingItemId: CID, name: 'Milch', quantity: '2', unit: 'LITER' },
    }),
    message(6, LISA, 'Kannst du noch Milch mitbringen?', '2026-10-12T13:48:00+02:00'),
  ];
}

const ME_REF = { id: ME, displayName: 'Julian' };
const names = new Map([
  [ME, 'Julian'],
  [LISA, 'Lisa'],
  [MAX, 'Max'],
]);

function rowsOf(rows: TimelineRow[]) {
  return rows.map((row) =>
    row.type === 'message'
      ? { type: row.type, text: row.message.content, gap: row.gap, meta: row.meta, receipt: row.receipt }
      : row.type === 'separator'
        ? { type: row.type, label: row.label, gap: row.gap }
        : { type: row.type, count: row.count, gap: row.gap },
  );
}

describe('seq helpers', () => {
  it('compares BIGINT strings numerically', () => {
    expect(compareSeq('9', '10')).toBeLessThan(0);
    expect(compareSeq('9223372036854775807', '9223372036854775806')).toBeGreaterThan(0);
    expect(compareSeq('42', '42')).toBe(0);
  });

  it('merges, dedupes by id and sorts by seq', () => {
    const [a, b, c] = lisaConversation();
    if (!a || !b || !c) throw new Error('fixture');
    const merged = mergeMessages([c, a], [b, { ...a, content: 'edited' }]);
    expect(merged.map((m) => m.seq)).toEqual(['1', '2', '3']);
    expect(merged[0]?.content).toBe('edited');
  });
});

describe('optimistic reconciliation', () => {
  const pending = (clientId: string, content: string, status: PendingMessage['status'] = 'sending') => ({
    clientId,
    conversationId: CID,
    kind: 'TEXT' as const,
    content,
    meta: null,
    createdAt: '2026-10-12T14:00:00+02:00',
    status,
  });

  it('appends pending messages after confirmed ones with a stable key', () => {
    const confirmed = lisaConversation();
    const display = reconcileMessages(confirmed, [pending('c-new', 'Bringe ich mit!')], ME_REF);
    const last = display.at(-1);
    expect(last).toMatchObject({ content: 'Bringe ich mit!', status: 'sending', senderId: ME, seq: null });
    expect(last?.key).toBe(`${ME}:c-new`);
  });

  it('drops the pending copy once the server message with the same clientId exists', () => {
    const confirmed = [
      ...lisaConversation(),
      message(7, ME, 'Bringe ich mit!', '2026-10-12T14:00:01+02:00', { clientId: 'c-new' }),
    ];
    const display = reconcileMessages(confirmed, [pending('c-new', 'Bringe ich mit!')], ME_REF);
    expect(display.filter((m) => m.clientId === 'c-new')).toHaveLength(1);
    const confirmedCopy = display.at(-1);
    expect(confirmedCopy).toMatchObject({ status: 'sent', seq: '7', key: `${ME}:c-new` });
  });

  it('does not confuse another sender’s clientId with mine', () => {
    const confirmed = [message(1, LISA, 'Hallo', '2026-10-12T14:00:00+02:00', { clientId: 'same-id' })];
    const display = reconcileMessages(confirmed, [pending('same-id', 'Mein Text', 'failed')], ME_REF);
    expect(display.map((m) => [m.senderId, m.status])).toEqual([
      [LISA, 'sent'],
      [ME, 'failed'],
    ]);
  });
});

describe('unread divider', () => {
  it('sits before the first unread message of someone else', () => {
    const messages = lisaConversation();
    expect(findUnreadMarker(messages, ME, '5')).toEqual({ seq: '6', count: 1 });
    expect(findUnreadMarker(messages, ME, '2')).toEqual({ seq: '3', count: 2 });
    expect(findUnreadMarker(messages, ME, '6')).toBeNull();
    // Own messages never count as unread.
    expect(
      findUnreadMarker(
        messages.filter((m) => m.sender?.id === ME),
        ME,
        '0',
      ),
    ).toBeNull();
    expect(findUnreadMarker(messages, ME, null)).toEqual({ seq: '1', count: 3 });
  });

  it('is placed in the timeline with the design gaps (08b)', () => {
    const messages = lisaConversation();
    const members: ReadState[] = [
      { userId: ME, lastReadSeq: '5' },
      { userId: LISA, lastReadSeq: '5' },
    ];
    const rows = buildTimeline(reconcileMessages(messages, [], ME_REF), {
      myId: ME,
      conversationType: 'DIRECT',
      members,
      memberNames: names,
      unread: findUnreadMarker(messages, ME, '5'),
      dateOptions: TZ,
    });
    expect(rowsOf(rows)).toEqual([
      { type: 'separator', label: 'Heute, 08:12', gap: 0 },
      { type: 'message', text: 'Hey, haben wir noch Kaffee zuhause?', gap: GAP.afterMarker, meta: null, receipt: null },
      { type: 'message', text: 'Ja, wir haben noch zwei Packungen ☕', gap: 11, meta: null, receipt: null },
      { type: 'message', text: 'Perfekt! Dann brauchen wir nur noch Milch.', gap: 11, meta: null, receipt: null },
      { type: 'message', text: 'Ich setze sie auf die Einkaufsliste.', gap: 11, meta: null, receipt: null },
      { type: 'message', text: 'Milch · 2 Liter', gap: GAP.sameSenderCard, meta: null, receipt: 'Gelesen' },
      { type: 'unread', count: 1, gap: GAP.beforeDivider },
      {
        type: 'message',
        text: 'Kannst du noch Milch mitbringen?',
        gap: GAP.afterMarker,
        meta: 'Lisa · 13:48',
        receipt: null,
      },
    ]);
  });
});

describe('grouping and separators', () => {
  it('uses tight gaps within a sender run and starts a separator per day', () => {
    const messages = [
      message(1, LISA, 'Gestern Abend', '2026-10-11T21:00:00+02:00'),
      message(2, LISA, 'Noch etwas', '2026-10-11T21:01:00+02:00'),
      message(3, ME, 'Heute früh', '2026-10-12T07:00:00+02:00'),
      message(4, ME, 'Und nochmals', '2026-10-12T07:00:30+02:00'),
    ];
    const rows = buildTimeline(reconcileMessages(messages, [], ME_REF), {
      myId: ME,
      conversationType: 'DIRECT',
      members: [{ userId: LISA, lastReadSeq: '0' }],
      memberNames: names,
      unread: null,
      dateOptions: TZ,
    });
    expect(rowsOf(rows).map((row) => ('label' in row ? row.label : `${row.type}:${row.gap}`))).toEqual([
      'Gestern, 21:00',
      'message:12',
      `message:${GAP.sameSender}`,
      'Heute, 07:00',
      'message:12',
      `message:${GAP.sameSender}`,
    ]);
    expect(rows[3]?.gap).toBe(GAP.beforeSeparator);
  });

  it('shows sender names under every incoming run in group chats', () => {
    const messages = [
      message(1, LISA, 'Hallo zusammen', '2026-10-12T09:00:00+02:00'),
      message(2, LISA, 'Wer kauft ein?', '2026-10-12T09:00:20+02:00'),
      message(3, MAX, 'Ich!', '2026-10-12T09:01:00+02:00'),
      message(4, ME, 'Danke Max', '2026-10-12T09:02:00+02:00'),
    ];
    const rows = buildTimeline(reconcileMessages(messages, [], ME_REF), {
      myId: ME,
      conversationType: 'HOUSEHOLD',
      members: [
        { userId: LISA, lastReadSeq: '4' },
        { userId: MAX, lastReadSeq: '3' },
      ],
      memberNames: names,
      unread: null,
      dateOptions: TZ,
    });
    const metas = rows.filter((row) => row.type === 'message').map((row) => row.type === 'message' && row.meta);
    expect(metas).toEqual([null, 'Lisa · 09:00', 'Max · 09:01', null]);
    const last = rows.at(-1);
    expect(last?.type === 'message' && last.receipt).toBe('Gelesen von Lisa');
  });
});

describe('read receipts', () => {
  it('requires every other member for "Gelesen"', () => {
    const members: ReadState[] = [
      { userId: ME, lastReadSeq: '9' },
      { userId: LISA, lastReadSeq: '9' },
      { userId: MAX, lastReadSeq: '8' },
    ];
    expect(readReceiptLabel('9', members, ME, names)).toBe('Gelesen von Lisa');
    expect(readReceiptLabel('8', members, ME, names)).toBe('Gelesen');
    expect(readReceiptLabel('10', members, ME, names)).toBeNull();
    expect(
      readReceiptLabel(
        '5',
        [...members, { userId: '55555555-5555-4555-8555-555555555555', lastReadSeq: '0' }],
        ME,
        names,
      ),
    ).toBe('Gelesen von Lisa und Max');
    expect(readReceiptLabel('5', [{ userId: ME, lastReadSeq: '9' }], ME, names)).toBeNull();
  });

  it('only marks the newest confirmed outgoing message', () => {
    const messages = lisaConversation();
    const pendingEntry: PendingMessage = {
      clientId: 'p-1',
      conversationId: CID,
      kind: 'TEXT',
      content: 'Unterwegs …',
      meta: null,
      createdAt: '2026-10-12T14:00:00+02:00',
      status: 'sending',
    };
    const rows = buildTimeline(reconcileMessages(messages, [pendingEntry], ME_REF), {
      myId: ME,
      conversationType: 'DIRECT',
      members: [{ userId: LISA, lastReadSeq: '6' }],
      memberNames: names,
      unread: null,
      dateOptions: TZ,
    });
    const receipts = rows.filter((row) => row.type === 'message' && row.receipt);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.type === 'message' && receipts[0].message.content).toBe('Milch · 2 Liter');
  });
});

describe('conversation list', () => {
  function conversation(id: string, type: ConversationDto['type'], last: MessageDto | null, unread = 0) {
    return {
      id,
      type,
      title: type === 'HOUSEHOLD' ? 'Unser Zuhause' : 'Lisa',
      members: [],
      lastMessage: last,
      unreadCount: unread,
      updatedAt: last?.createdAt ?? '2026-10-01T00:00:00Z',
    } satisfies ConversationDto;
  }

  it('builds previews with sender prefixes in group chats', () => {
    const groupMessage = message(9, LISA, 'Ich habe die\nEinkaufsliste aktualisiert.', '2026-10-12T14:32:00+02:00');
    expect(conversationPreview(conversation('a', 'HOUSEHOLD', groupMessage), ME)).toBe(
      'Lisa: Ich habe die Einkaufsliste aktualisiert.',
    );
    expect(conversationPreview(conversation('b', 'DIRECT', groupMessage), ME)).toBe(
      'Ich habe die Einkaufsliste aktualisiert.',
    );
    const mine = message(10, ME, 'Bringe ich mit!', '2026-10-12T14:33:00+02:00');
    expect(conversationPreview(conversation('b', 'DIRECT', mine), ME)).toBe('Du: Bringe ich mit!');
    const card = message(11, LISA, 'Milch · 2 Liter', '2026-10-12T14:34:00+02:00', { kind: 'SHOPPING_ITEM' });
    expect(conversationPreview(conversation('a', 'HOUSEHOLD', card), ME)).toBe(
      'Lisa: Zur Einkaufsliste: Milch · 2 Liter',
    );
  });

  it('filters by title and preview, ignoring case and accents', () => {
    const list = [
      conversation('a', 'HOUSEHOLD', message(1, LISA, 'Käse kaufen', '2026-10-12T10:00:00+02:00')),
      conversation('b', 'DIRECT', message(2, LISA, 'Hallo', '2026-10-12T11:00:00+02:00')),
    ];
    expect(filterConversations(list, 'kase', ME).map((c) => c.id)).toEqual(['a']);
    expect(filterConversations(list, 'LISA', ME).map((c) => c.id)).toEqual(['a', 'b']);
    expect(filterConversations(list, '  ', ME)).toHaveLength(2);
  });

  it('applies realtime messages: preview, unread count and order', () => {
    const list = sortConversations([
      conversation('group', 'HOUSEHOLD', message(5, LISA, 'Alt', '2026-10-12T10:00:00+02:00')),
      conversation('direct', 'DIRECT', message(7, LISA, 'Neuer', '2026-10-12T11:00:00+02:00'), 1),
      conversation('empty', 'DIRECT', null),
    ]);
    expect(list.map((c) => c.id)).toEqual(['direct', 'group', 'empty']);

    const incoming = { ...message(8, LISA, 'Ganz neu', '2026-10-12T12:00:00+02:00'), conversationId: 'group' };
    const next = applyMessageToConversations(list, incoming, ME);
    expect(next?.map((c) => [c.id, c.unreadCount])).toEqual([
      ['group', 1],
      ['direct', 1],
      ['empty', 0],
    ]);
    expect(next?.[0]?.lastMessage?.content).toBe('Ganz neu');

    // Own messages clear the badge; stale (older) events change nothing; unknown → null.
    const own = { ...message(9, ME, 'Antwort', '2026-10-12T12:01:00+02:00'), conversationId: 'direct' };
    expect(applyMessageToConversations(next ?? [], own, ME)?.find((c) => c.id === 'direct')?.unreadCount).toBe(0);
    const stale = { ...message(3, LISA, 'Uralt', '2026-10-12T09:00:00+02:00'), conversationId: 'group' };
    expect(applyMessageToConversations(next ?? [], stale, ME)?.[0]?.lastMessage?.content).toBe('Ganz neu');
    expect(applyMessageToConversations(list, { ...incoming, conversationId: 'unknown' }, ME)).toBeNull();
  });

  it('clears the badge when my read cursor covers the newest message', () => {
    const list = [conversation('direct', 'DIRECT', message(7, LISA, 'Neu', '2026-10-12T11:00:00+02:00'), 2)];
    expect(applyOwnReadToConversations(list, 'direct', '7')).toEqual({
      conversations: [{ ...list[0], unreadCount: 0 }],
      exact: true,
    });
    expect(applyOwnReadToConversations(list, 'direct', '6').exact).toBe(false);
  });
});

describe('shopping item card title', () => {
  it('formats name, quantity and unit like the design', () => {
    expect(shoppingItemMessageTitle({ name: 'Milch', quantity: '2', unit: 'LITER' })).toBe('Milch · 2 Liter');
    expect(shoppingItemMessageTitle({ name: 'Eier', quantity: '6', unit: null })).toBe('Eier · 6');
    expect(shoppingItemMessageTitle({ name: 'Brot', quantity: null, unit: null })).toBe('Brot');
    expect(shoppingItemMessageTitle({ name: 'Mehl', quantity: '1.5', unit: 'KILOGRAMM' })).toBe('Mehl · 1.5 kg');
  });
});
