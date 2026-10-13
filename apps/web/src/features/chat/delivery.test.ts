import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationDto, MeResponse, MessageDto, MessagePage } from '@homi/shared';
import { ApiError } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { createQueryClient } from '@/lib/queryClient';
import { applyConfirmedMessage, applyReadEvent, type MessagesData } from './cache';
import { flushOutbox, markConversationRead, retryChatMessage, sendChatMessage } from './delivery';
import { useOutboxStore } from './outbox';

const HID = '11111111-1111-4111-8111-111111111111';
const CID = '22222222-2222-4222-8222-222222222222';
const ME = '33333333-3333-4333-8333-333333333333';
const LISA = '44444444-4444-4444-8444-444444444444';

type Ack = (error: Error | null, response?: unknown) => void;

const socket = vi.hoisted(() => ({
  connected: false,
  sent: [] as Array<{ event: string; payload: unknown; ack?: Ack }>,
  timeout() {
    return {
      emit: (event: string, payload: unknown, ack: Ack) => socket.sent.push({ event, payload, ack }),
    };
  },
  emit(event: string, payload: unknown, ack?: Ack) {
    socket.sent.push({ event, payload, ack });
  },
}));

vi.mock('@/lib/socket', () => ({ getSocket: () => socket }));
vi.mock('@/api/chat', () => ({ postMessage: vi.fn(), postReadCursor: vi.fn() }));
vi.mock('@/components', () => ({ showToast: vi.fn() }));

const api = await import('@/api/chat');
const postMessage = vi.mocked(api.postMessage);
const postReadCursor = vi.mocked(api.postReadCursor);

function serverMessage(clientId: string, content: string, seq = '10'): MessageDto {
  return {
    id: `00000000-0000-4000-8000-0000000000${seq.padStart(2, '0')}`,
    seq,
    conversationId: CID,
    sender: { id: ME, displayName: 'Julian' },
    kind: 'TEXT',
    content,
    meta: null,
    createdAt: '2026-10-12T14:00:00.000Z',
    clientId,
  };
}

function setupClient() {
  const client = createQueryClient();
  client.setQueryData<MeResponse>(queryKeys.me, {
    user: { id: ME, displayName: 'Julian', email: 'julian@example.ch', createdAt: '2026-01-01T00:00:00.000Z' },
    households: [{ id: HID, name: 'Unser Zuhause', role: 'OWNER', memberCount: 2 }],
    activeHouseholdId: HID,
  });
  const page: MessagePage = {
    messages: [],
    hasMore: false,
    members: [
      { userId: ME, lastReadSeq: '0' },
      { userId: LISA, lastReadSeq: '0' },
    ],
  };
  client.setQueryData<MessagesData>(queryKeys.messages(HID, CID), { pages: [page], pageParams: [undefined] });
  const conversation: ConversationDto = {
    id: CID,
    type: 'DIRECT',
    title: 'Lisa',
    members: [],
    lastMessage: null,
    unreadCount: 3,
    updatedAt: '2026-10-12T13:00:00.000Z',
  };
  client.setQueryData<ConversationDto[]>(queryKeys.conversations(HID), [conversation]);
  return client;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const cachedMessages = (client: ReturnType<typeof setupClient>) =>
  client.getQueryData<MessagesData>(queryKeys.messages(HID, CID))?.pages[0]?.messages ?? [];

beforeEach(() => {
  useOutboxStore.getState().reset();
  socket.connected = false;
  socket.sent = [];
  postMessage.mockReset();
  postReadCursor.mockReset();
});

describe('optimistic send', () => {
  it('shows the message immediately and reconciles it by clientId (HTTP)', async () => {
    const client = setupClient();
    let resolve: (message: MessageDto) => void = () => undefined;
    postMessage.mockReturnValue(new Promise<MessageDto>((done) => (resolve = done)));

    const clientId = sendChatMessage(client, { householdId: HID, conversationId: CID, content: 'Bringe ich mit!' });
    expect(useOutboxStore.getState().entries).toMatchObject([
      { clientId, status: 'sending', content: 'Bringe ich mit!' },
    ]);
    expect(postMessage).toHaveBeenCalledWith(HID, CID, { clientId, content: 'Bringe ich mit!', kind: 'TEXT' });

    resolve(serverMessage(clientId, 'Bringe ich mit!'));
    await flush();
    expect(useOutboxStore.getState().entries).toEqual([]);
    expect(cachedMessages(client).map((message) => message.clientId)).toEqual([clientId]);
    const list = client.getQueryData<ConversationDto[]>(queryKeys.conversations(HID));
    expect(list?.[0]).toMatchObject({ lastMessage: { clientId }, unreadCount: 0 });

    // The realtime echo of the same message does not duplicate it.
    applyConfirmedMessage(client, HID, serverMessage(clientId, 'Bringe ich mit!'));
    expect(cachedMessages(client)).toHaveLength(1);
  });

  it('uses the socket with an ack while connected', async () => {
    const client = setupClient();
    socket.connected = true;
    const clientId = sendChatMessage(client, { householdId: HID, conversationId: CID, content: 'Über den Socket' });
    expect(postMessage).not.toHaveBeenCalled();
    const sent = socket.sent[0];
    expect(sent).toMatchObject({
      event: 'chat:send',
      payload: { conversationId: CID, clientId, content: 'Über den Socket', kind: 'TEXT' },
    });
    sent?.ack?.(null, { ok: true, message: serverMessage(clientId, 'Über den Socket') });
    await flush();
    expect(useOutboxStore.getState().entries).toEqual([]);
    expect(cachedMessages(client)).toHaveLength(1);
  });

  it('marks connection failures as failed and retries them with the same clientId on reconnect', async () => {
    const client = setupClient();
    postMessage.mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'offline' }));
    const clientId = sendChatMessage(client, { householdId: HID, conversationId: CID, content: 'Funkloch' });
    await flush();
    expect(useOutboxStore.getState().entries).toMatchObject([{ clientId, status: 'failed', retryOnReconnect: true }]);

    postMessage.mockResolvedValueOnce(serverMessage(clientId, 'Funkloch'));
    flushOutbox(client);
    expect(useOutboxStore.getState().entries[0]?.status).toBe('sending');
    await flush();
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage.mock.calls.map((call) => call[2].clientId)).toEqual([clientId, clientId]);
    expect(useOutboxStore.getState().entries).toEqual([]);
  });

  it('keeps rejected messages for a manual retry only', async () => {
    const client = setupClient();
    socket.connected = true;
    const clientId = sendChatMessage(client, { householdId: HID, conversationId: CID, content: 'Zu schnell' });
    socket.sent[0]?.ack?.(null, { ok: false, error: { code: 'RATE_LIMITED', message: 'Zu viele Nachrichten.' } });
    await flush();
    expect(useOutboxStore.getState().entries).toMatchObject([
      { clientId, status: 'failed', retryOnReconnect: false, error: 'Zu viele Nachrichten.' },
    ]);

    flushOutbox(client);
    expect(socket.sent).toHaveLength(1);

    retryChatMessage(client, clientId);
    expect(socket.sent).toHaveLength(2);
    expect(socket.sent[1]?.payload).toMatchObject({ clientId });
    socket.sent[1]?.ack?.(new Error('timeout'));
    await flush();
    expect(useOutboxStore.getState().entries[0]).toMatchObject({ status: 'failed', retryOnReconnect: true });
  });

  it('never delivers the same entry twice concurrently', async () => {
    const client = setupClient();
    postMessage.mockReturnValue(new Promise<MessageDto>(() => undefined));
    const clientId = sendChatMessage(client, { householdId: HID, conversationId: CID, content: 'Einmal' });
    flushOutbox(client);
    retryChatMessage(client, clientId);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it('sends shopping item messages with only the item reference', () => {
    const client = setupClient();
    postMessage.mockReturnValue(new Promise<MessageDto>(() => undefined));
    const meta = {
      shoppingItemId: '55555555-5555-4555-8555-555555555555',
      name: 'Milch',
      quantity: '2',
      unit: 'LITER' as const,
    };
    const clientId = sendChatMessage(client, {
      householdId: HID,
      conversationId: CID,
      kind: 'SHOPPING_ITEM',
      content: 'Milch · 2 Liter',
      shoppingItem: meta,
    });
    expect(postMessage).toHaveBeenCalledWith(HID, CID, {
      clientId,
      content: 'Milch · 2 Liter',
      kind: 'SHOPPING_ITEM',
      meta: { shoppingItemId: meta.shoppingItemId },
    });
    expect(useOutboxStore.getState().entries[0]?.meta).toEqual(meta);
  });
});

describe('read cursor', () => {
  it('updates receipts and badges optimistically and sends each position once', () => {
    const client = setupClient();
    client.setQueryData<ConversationDto[]>(queryKeys.conversations(HID), (list) =>
      list?.map((conversation) => ({ ...conversation, lastMessage: serverMessage('x-1', 'Neu', '12') })),
    );
    postReadCursor.mockResolvedValue({ conversationId: CID, userId: ME, seq: '12' });

    markConversationRead(client, HID, CID, '12');
    markConversationRead(client, HID, CID, '12');
    markConversationRead(client, HID, CID, '11');
    expect(postReadCursor).toHaveBeenCalledTimes(1);
    expect(postReadCursor).toHaveBeenCalledWith(HID, CID, '12');
    expect(client.getQueryData<ConversationDto[]>(queryKeys.conversations(HID))?.[0]?.unreadCount).toBe(0);
    const members = client.getQueryData<MessagesData>(queryKeys.messages(HID, CID))?.pages[0]?.members;
    expect(members?.find((member) => member.userId === ME)?.lastReadSeq).toBe('12');
  });

  it('applies other members’ cursors monotonically', () => {
    const client = setupClient();
    applyReadEvent(client, CID, LISA, '20');
    applyReadEvent(client, CID, LISA, '7');
    const members = client.getQueryData<MessagesData>(queryKeys.messages(HID, CID))?.pages[0]?.members;
    expect(members?.find((member) => member.userId === LISA)?.lastReadSeq).toBe('20');
    // Someone else reading does not touch my unread badge.
    expect(client.getQueryData<ConversationDto[]>(queryKeys.conversations(HID))?.[0]?.unreadCount).toBe(3);
  });
});
