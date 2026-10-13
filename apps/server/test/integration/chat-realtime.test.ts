import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import {
  SOCKET_PATH,
  type ChatMessageEvent,
  type ChatReadEvent,
  type ChatSendPayload,
  type ChatTypingEvent,
  type ClientToServerEvents,
  type ConversationDto,
  type MessageDto,
  type MessagePage,
  type ServerToClientEvents,
  type SocketAck,
} from '@homi/shared';
import { userRoom } from '../../src/plugins/realtime';
import { buildTestApp, type TestApp } from '../helpers/app';
import { TEST_APP_URL } from '../helpers/config';
import { addMember, createHousehold, createLoggedInUser, type TestHousehold } from '../helpers/fixtures';
import type { TestClient } from '../helpers/http';

/*
 * Chat over Socket.IO (§6) with real socket.io-client connections against the listening test
 * app: delivery only to conversation members, membership checks per event, idempotent
 * `chat:send`, read cursors, typing fan-out, rate limits and history after a reconnect.
 */

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Participant {
  id: string;
  name: string;
  client: TestClient;
  socket: ClientSocket;
  messages: ChatMessageEvent[];
  reads: ChatReadEvent[];
  typing: ChatTypingEvent[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('waitFor: timed out');
    await sleep(20);
  }
}

/**
 * Runs `operation` while a member removal holds the household row `FOR UPDATE` (like
 * households/service.ts `lockHousehold` for leave/remove): waits until the operation is blocked
 * by that lock, then deletes `userId`'s memberships and commits, so the operation continues with
 * the member already gone.
 */
async function removeMemberDuring<T>(
  prisma: TestApp['prisma'],
  household: Pick<TestHousehold, 'id'>,
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  let lockerPid = 0;
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let locked!: () => void;
  const lockHeld = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const removal = prisma.$transaction(
    async (tx) => {
      const [backend] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS "pid"`;
      lockerPid = Number(backend?.pid ?? 0);
      await tx.$queryRaw`SELECT "id"::text FROM "Household" WHERE "id" = ${household.id}::uuid FOR UPDATE`;
      locked();
      await released;
      await tx.conversationMember.deleteMany({ where: { userId, conversation: { householdId: household.id } } });
      await tx.householdMember.deleteMany({ where: { householdId: household.id, userId } });
    },
    { timeout: 15_000, maxWait: 5_000 },
  );
  await lockHeld;
  const pending = operation();
  pending.catch(() => undefined);
  try {
    await waitFor(async () => {
      const [row] = await prisma.$queryRaw<Array<{ waiting: number }>>`
        SELECT COUNT(*)::int AS "waiting" FROM pg_stat_activity WHERE ${lockerPid}::int = ANY(pg_blocking_pids(pid))`;
      return Number(row?.waiting ?? 0) > 0;
    });
  } finally {
    release();
    await removal;
  }
  return pending;
}

function clientId(): string {
  return `s-${randomUUID()}`;
}

function sendOverSocket(socket: ClientSocket, payload: ChatSendPayload): Promise<SocketAck<{ message: MessageDto }>> {
  return new Promise((resolve, reject) => {
    socket.timeout(5_000).emit('chat:send', payload, (error: Error | null, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

/** Untyped emitter: tests send payloads/acks the typed event map would reject. */
interface LooseEmitter {
  emit: (event: string, ...args: unknown[]) => void;
}

function readOverSocket(socket: ClientSocket, conversationId: string, seq: string): Promise<SocketAck> {
  return new Promise((resolve, reject) => {
    const emitter = socket.timeout(5_000) as unknown as LooseEmitter;
    emitter.emit('chat:read', { conversationId, seq }, (error: Error | null, response: SocketAck) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

function setup(options: { rateLimit?: boolean } = {}) {
  const state: { t?: TestApp; baseUrl?: string; sockets: ClientSocket[] } = { sockets: [] };

  beforeAll(async () => {
    state.t = await buildTestApp({ rateLimit: options.rateLimit ?? false });
    state.baseUrl = await state.t.app.listen({ port: 0, host: '127.0.0.1' });
  });

  afterEach(() => {
    for (const socket of state.sockets.splice(0)) socket.disconnect();
  });

  afterAll(async () => {
    await state.t?.close();
  });

  const app = (): TestApp => {
    if (!state.t) throw new Error('test app not ready');
    return state.t;
  };

  async function openSocket(client: TestClient): Promise<ClientSocket> {
    const socket: ClientSocket = connect(state.baseUrl ?? '', {
      path: SOCKET_PATH,
      transports: ['websocket'],
      extraHeaders: { origin: TEST_APP_URL, cookie: client.cookieHeader() },
      reconnection: false,
      forceNew: true,
    });
    state.sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    return socket;
  }

  async function participant(name: string): Promise<Participant> {
    const { user, client } = await createLoggedInUser(app().app, { displayName: name });
    const socket = await openSocket(client);
    const entry: Participant = { id: user.id, name, client, socket, messages: [], reads: [], typing: [] };
    socket.on('chat:message', (event) => entry.messages.push(event));
    socket.on('chat:read', (event) => entry.reads.push(event));
    socket.on('chat:typing', (event) => entry.typing.push(event));
    // The user room is joined right after the handshake.
    await waitFor(
      () =>
        app()
          .app.realtime.io.sockets.adapter.rooms.get(userRoom(user.id))
          ?.has(socket.id ?? '') === true,
    );
    return entry;
  }

  return { app, openSocket, participant };
}

describe('chat over Socket.IO', () => {
  const { app, openSocket, participant } = setup();

  interface World {
    household: TestHousehold;
    owner: Participant;
    lisa: Participant;
    max: Participant;
    eve: Participant;
    other: TestHousehold;
    direct: ConversationDto;
  }

  async function world(): Promise<World> {
    const owner = await participant('Julian');
    const lisa = await participant('Lisa');
    const max = await participant('Max');
    const eve = await participant('Eve');
    const household = await createHousehold(app().prisma, owner.id, 'Unser Zuhause');
    await addMember(app().prisma, household, lisa.id);
    await addMember(app().prisma, household, max.id);
    const other = await createHousehold(app().prisma, eve.id, 'Andere WG');
    const response = await owner.client.post(`/api/households/${household.id}/conversations/direct`, {
      userId: lisa.id,
    });
    const direct = response.json<ConversationDto>();
    return { household, owner, lisa, max, eve, other, direct };
  }

  it('delivers chat:message only to the members of the conversation', async () => {
    const w = await world();
    const ack = await sendOverSocket(w.owner.socket, {
      conversationId: w.direct.id,
      clientId: clientId(),
      content: 'Kannst du noch Milch mitbringen?',
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect(ack.message).toMatchObject({ content: 'Kannst du noch Milch mitbringen?', sender: { id: w.owner.id } });

    await waitFor(() => w.lisa.messages.length === 1 && w.owner.messages.length === 1);
    expect(w.lisa.messages[0]).toEqual({
      householdId: w.household.id,
      conversationId: w.direct.id,
      message: ack.message,
    });

    // HTTP sends fan out the same way – the household chat reaches all three members.
    const response = await w.lisa.client.post(
      `/api/households/${w.household.id}/conversations/${w.household.conversationId}/messages`,
      { clientId: clientId(), content: 'Ich habe die Einkaufsliste aktualisiert.' },
    );
    expect(response.statusCode).toBe(201);
    await waitFor(() => w.max.messages.length === 1 && w.owner.messages.length === 2 && w.lisa.messages.length === 2);
    await sleep(250);
    expect(w.max.messages.map((event) => event.conversationId)).toEqual([w.household.conversationId]);
    expect(w.eve.messages).toEqual([]);
  });

  it('acknowledges idempotent retries without a second delivery', async () => {
    const w = await world();
    const payload = { conversationId: w.direct.id, clientId: clientId(), content: 'Bringe ich mit!' };
    const [first, second] = await Promise.all([
      sendOverSocket(w.lisa.socket, payload),
      sendOverSocket(w.lisa.socket, payload),
    ]);
    const third = await sendOverSocket(w.lisa.socket, { ...payload, content: 'verändert' });
    expect(first.ok && second.ok && third.ok).toBe(true);
    if (!first.ok || !second.ok || !third.ok) return;
    expect(second.message.id).toBe(first.message.id);
    expect(third.message).toEqual(first.message);

    await waitFor(() => w.owner.messages.length >= 1);
    await sleep(250);
    expect(w.owner.messages).toHaveLength(1);
    expect(await app().prisma.message.count({ where: { conversationId: w.direct.id } })).toBe(1);
  });

  it('rejects chat:send for non-members and invalid payloads', async () => {
    const w = await world();
    const attempts: Array<[Participant, string]> = [
      [w.max, w.direct.id], // household member, not in the direct chat
      [w.eve, w.direct.id], // other household
      [w.eve, w.household.conversationId],
      [w.owner, w.other.conversationId],
      [w.owner, randomUUID()],
    ];
    for (const [who, conversationId] of attempts) {
      const ack = await sendOverSocket(who.socket, { conversationId, clientId: clientId(), content: 'Hallo?' });
      expect(ack).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: expect.any(String) } });
    }

    const invalid = await sendOverSocket(w.owner.socket, {
      conversationId: w.direct.id,
      clientId: 'x',
      content: '',
    });
    expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    const garbage = await sendOverSocket(w.owner.socket, 'nonsense' as unknown as ChatSendPayload);
    expect(garbage).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    // Regression (review): U+0000 used to fail the insert with INTERNAL (and an endless client retry).
    const nul = await sendOverSocket(w.owner.socket, {
      conversationId: w.direct.id,
      clientId: clientId(),
      content: 'a\u0000b',
    });
    expect(nul).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });

    const foreignItem = await app().prisma.shoppingItem.create({
      data: { shoppingListId: w.other.shoppingListId, householdId: w.other.id, name: 'Fremd' },
    });
    const shopping = await sendOverSocket(w.owner.socket, {
      conversationId: w.direct.id,
      clientId: clientId(),
      content: 'Fremd',
      kind: 'SHOPPING_ITEM',
      meta: { shoppingItemId: foreignItem.id },
    });
    expect(shopping).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });

    // Without an ack callback the server must neither crash nor store anything invalid.
    (w.eve.socket as unknown as LooseEmitter).emit('chat:send', {
      conversationId: w.direct.id,
      clientId: clientId(),
      content: 'Ohne Ack',
    });
    await sleep(250);
    expect(w.eve.socket.connected).toBe(true);

    expect(await app().prisma.message.count({ where: { conversationId: w.direct.id } })).toBe(0);
    expect(await app().prisma.message.count({ where: { conversationId: w.household.conversationId } })).toBe(0);
    for (const who of [w.owner, w.lisa, w.max, w.eve]) expect(who.messages).toEqual([]);
  });

  it('moves read cursors forward and notifies the members', async () => {
    const w = await world();
    const ack = await sendOverSocket(w.lisa.socket, {
      conversationId: w.direct.id,
      clientId: clientId(),
      content: 'Gelesen?',
    });
    if (!ack.ok) throw new Error('send failed');
    // Sending moved Lisa's own cursor.
    await waitFor(() => w.owner.reads.some((event) => event.userId === w.lisa.id));

    expect(await readOverSocket(w.owner.socket, w.direct.id, ack.message.seq)).toEqual({ ok: true });
    await waitFor(() => w.lisa.reads.some((event) => event.userId === w.owner.id));
    expect(w.lisa.reads.find((event) => event.userId === w.owner.id)).toEqual({
      conversationId: w.direct.id,
      userId: w.owner.id,
      seq: ack.message.seq,
    });

    // Re-reading the same or an older seq changes nothing and emits nothing.
    const before = w.lisa.reads.length;
    expect(await readOverSocket(w.owner.socket, w.direct.id, '1')).toEqual({ ok: true });
    await sleep(200);
    expect(w.lisa.reads).toHaveLength(before);

    // Strangers cannot move cursors or learn anything.
    expect(await readOverSocket(w.max.socket, w.direct.id, ack.message.seq)).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(await readOverSocket(w.eve.socket, w.direct.id, ack.message.seq)).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(await readOverSocket(w.owner.socket, 'x' as string, '1')).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(w.max.reads).toEqual([]);
    expect(w.eve.reads).toEqual([]);
  });

  it('forwards typing indicators to the other members only', async () => {
    const w = await world();
    w.lisa.socket.emit('chat:typing', { conversationId: w.direct.id, typing: true });
    await waitFor(() => w.owner.typing.length === 1);
    expect(w.owner.typing[0]).toEqual({
      conversationId: w.direct.id,
      userId: w.lisa.id,
      displayName: 'Lisa',
      typing: true,
    });

    w.eve.socket.emit('chat:typing', { conversationId: w.household.conversationId, typing: true });
    w.max.socket.emit('chat:typing', { conversationId: w.direct.id, typing: true });
    w.max.socket.emit('chat:typing', { conversationId: 'kaputt', typing: true } as never);
    await sleep(300);
    expect(w.owner.typing).toHaveLength(1);
    expect(w.lisa.typing).toEqual([]);
    expect(w.max.typing).toEqual([]);
    expect(w.eve.typing).toEqual([]);
  });

  it('stops delivering to members who left the household', async () => {
    const w = await world();
    await app().prisma.conversationMember.deleteMany({ where: { userId: w.max.id } });
    await app().prisma.householdMember.deleteMany({ where: { userId: w.max.id, householdId: w.household.id } });

    const denied = await sendOverSocket(w.max.socket, {
      conversationId: w.household.conversationId,
      clientId: clientId(),
      content: 'Bin ich noch da?',
    });
    expect(denied).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const ack = await sendOverSocket(w.owner.socket, {
      conversationId: w.household.conversationId,
      clientId: clientId(),
      content: 'Max ist ausgezogen.',
    });
    expect(ack.ok).toBe(true);
    await waitFor(() => w.lisa.messages.length === 1);
    await sleep(250);
    expect(w.max.messages).toEqual([]);
  });

  // Regression (review): the socket path emitted to the member list read before the write.
  it('delivers nothing to a member removed while a send or read waited for the household lock', async () => {
    for (const operation of ['socket send', 'socket read', 'http send', 'http read'] as const) {
      const w = await world();
      const cid = w.household.conversationId;
      const fromLisa = await sendOverSocket(w.lisa.socket, {
        conversationId: cid,
        clientId: clientId(),
        content: 'Hallo',
      });
      if (!fromLisa.ok) throw new Error('send failed');
      await waitFor(() => w.max.messages.length === 1 && w.owner.messages.length === 1);
      await sleep(100);
      w.max.messages.length = 0;
      w.max.reads.length = 0;
      w.lisa.messages.length = 0;
      w.lisa.reads.length = 0;

      const content = `Nach dem Auszug (${operation})`;
      const messagesPath = `/api/households/${w.household.id}/conversations/${cid}/messages`;
      const readPath = `/api/households/${w.household.id}/conversations/${cid}/read`;
      const succeeded = await removeMemberDuring(app().prisma, w.household, w.max.id, async () => {
        switch (operation) {
          case 'socket send':
            return (await sendOverSocket(w.owner.socket, { conversationId: cid, clientId: clientId(), content })).ok;
          case 'socket read':
            return (await readOverSocket(w.owner.socket, cid, fromLisa.message.seq)).ok;
          case 'http send':
            return (await w.owner.client.post(messagesPath, { clientId: clientId(), content })).statusCode === 201;
          case 'http read':
            return (await w.owner.client.post(readPath, { seq: fromLisa.message.seq })).statusCode === 200;
        }
      });
      expect(succeeded, operation).toBe(true);
      expect(await app().prisma.householdMember.count({ where: { userId: w.max.id } })).toBe(0);

      // Lisa (still a member) is notified; Max, removed while the write waited, gets nothing.
      if (operation.endsWith('send')) await waitFor(() => w.lisa.messages.some((e) => e.message.content === content));
      await waitFor(() => w.lisa.reads.some((event) => event.userId === w.owner.id));
      await sleep(250);
      expect(w.max.messages, operation).toEqual([]);
      expect(w.max.reads, operation).toEqual([]);
    }
  });

  it('keeps history across reconnects and catches up with ?after=', async () => {
    const w = await world();
    const first = await sendOverSocket(w.owner.socket, {
      conversationId: w.direct.id,
      clientId: clientId(),
      content: 'Vor dem Funkloch',
    });
    if (!first.ok) throw new Error('send failed');
    await waitFor(() => w.lisa.messages.length === 1);

    w.lisa.socket.disconnect();
    for (const content of ['Während des Funklochs 1', 'Während des Funklochs 2']) {
      const ack = await sendOverSocket(w.owner.socket, { conversationId: w.direct.id, clientId: clientId(), content });
      expect(ack.ok).toBe(true);
    }

    const reconnected = await openSocket(w.lisa.client);
    expect(reconnected.connected).toBe(true);
    const url = `/api/households/${w.household.id}/conversations/${w.direct.id}/messages`;
    const missed = (await w.lisa.client.get(url, { query: { after: first.message.seq } })).json<MessagePage>();
    expect(missed.messages.map((message) => message.content)).toEqual([
      'Während des Funklochs 1',
      'Während des Funklochs 2',
    ]);
    expect(missed.hasMore).toBe(false);
    const history = (await w.lisa.client.get(url)).json<MessagePage>();
    expect(history.messages.map((message) => message.content)).toEqual([
      'Vor dem Funkloch',
      'Während des Funklochs 1',
      'Während des Funklochs 2',
    ]);

    // The new connection receives new messages again.
    const received: ChatMessageEvent[] = [];
    reconnected.on('chat:message', (event) => received.push(event));
    await sendOverSocket(w.owner.socket, { conversationId: w.direct.id, clientId: clientId(), content: 'Wieder da?' });
    await waitFor(() => received.length === 1);
  });
});

describe('chat socket rate limiting', () => {
  const { app, participant } = setup({ rateLimit: true });

  it('limits new messages per user across socket and HTTP', async () => {
    const owner = await participant('Schnell');
    const household = await createHousehold(app().prisma, owner.id);
    const ids = Array.from({ length: 20 }, () => clientId());
    for (const id of ids) {
      const ack = await sendOverSocket(owner.socket, {
        conversationId: household.conversationId,
        clientId: id,
        content: 'Tempo',
      });
      expect(ack.ok).toBe(true);
    }
    const limited = await sendOverSocket(owner.socket, {
      conversationId: household.conversationId,
      clientId: clientId(),
      content: 'Zu schnell',
    });
    expect(limited).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });

    const http = await owner.client.post(
      `/api/households/${household.id}/conversations/${household.conversationId}/messages`,
      { clientId: clientId(), content: 'Über HTTP' },
    );
    expect(http.statusCode).toBe(429);

    // Retrying a stored message still succeeds (idempotent).
    const retry = await sendOverSocket(owner.socket, {
      conversationId: household.conversationId,
      clientId: ids[0] ?? '',
      content: 'Tempo',
    });
    expect(retry.ok).toBe(true);
    expect(await app().prisma.message.count({ where: { conversationId: household.conversationId } })).toBe(20);
  });

  // Regression (review): the socket handlers skipped the per-user attempt limits of the HTTP routes.
  it('limits chat:read per user (60 / 10 s) with the budget shared with HTTP', async () => {
    const reader = await participant('Leserin');
    const household = await createHousehold(app().prisma, reader.id);
    const sent = await sendOverSocket(reader.socket, {
      conversationId: household.conversationId,
      clientId: clientId(),
      content: 'Etwas zum Lesen',
    });
    if (!sent.ok) throw new Error('send failed');
    const readPath = `/api/households/${household.id}/conversations/${household.conversationId}/read`;
    // 20 over HTTP, then the socket: together 60 are allowed.
    for (let index = 0; index < 20; index += 1) {
      expect((await reader.client.post(readPath, { seq: sent.message.seq })).statusCode).toBe(200);
    }
    const codes: string[] = [];
    for (let index = 0; index < 45; index += 1) {
      const ack = await readOverSocket(reader.socket, household.conversationId, sent.message.seq);
      codes.push(ack.ok ? 'OK' : ack.error.code);
    }
    expect(codes.filter((code) => code === 'OK')).toHaveLength(40);
    expect(codes.slice(40)).toEqual(Array.from({ length: 5 }, () => 'RATE_LIMITED'));
    expect((await reader.client.post(readPath, { seq: sent.message.seq })).statusCode).toBe(429);
  });

  it('limits chat:send attempts incl. retries and foreign conversations (60 / 10 s, shared with HTTP)', async () => {
    const owner = await participant('Wiederholer');
    const stranger = await participant('Fremder');
    const household = await createHousehold(app().prisma, owner.id);
    await createHousehold(app().prisma, stranger.id, 'Andere WG');
    const messagesPath = `/api/households/${household.id}/conversations/${household.conversationId}/messages`;

    // Idempotent retries of one message: answered from the database, but still attempts.
    const id = clientId();
    const retries: string[] = [];
    for (let index = 0; index < 62; index += 1) {
      const ack = await sendOverSocket(owner.socket, {
        conversationId: household.conversationId,
        clientId: id,
        content: 'Nochmal',
      });
      retries.push(ack.ok ? 'OK' : ack.error.code);
    }
    expect(retries.slice(0, 60)).toEqual(Array.from({ length: 60 }, () => 'OK'));
    expect(retries.slice(60)).toEqual(['RATE_LIMITED', 'RATE_LIMITED']);
    expect((await owner.client.post(messagesPath, { clientId: id, content: 'Nochmal' })).statusCode).toBe(429);
    expect(await app().prisma.message.count({ where: { conversationId: household.conversationId } })).toBe(1);

    // Probing a foreign conversation is throttled the same way (no unlimited 404 oracle).
    const probes: string[] = [];
    for (let index = 0; index < 62; index += 1) {
      const ack = await sendOverSocket(stranger.socket, {
        conversationId: household.conversationId,
        clientId: clientId(),
        content: 'Hallo?',
      });
      probes.push(ack.ok ? 'OK' : ack.error.code);
    }
    expect(probes.slice(0, 60)).toEqual(Array.from({ length: 60 }, () => 'NOT_FOUND'));
    expect(probes.slice(60)).toEqual(['RATE_LIMITED', 'RATE_LIMITED']);
    const strangerHttp = await stranger.client.post(messagesPath, { clientId: clientId(), content: 'Hallo?' });
    expect(strangerHttp.statusCode).toBe(429);
  });

  it('forwards at most one typing start per second and user', async () => {
    const owner = await participant('Tipper');
    const lisa = await participant('Leserin');
    const household = await createHousehold(app().prisma, owner.id);
    await addMember(app().prisma, household, lisa.id);
    for (let index = 0; index < 5; index += 1) {
      owner.socket.emit('chat:typing', { conversationId: household.conversationId, typing: true });
    }
    owner.socket.emit('chat:typing', { conversationId: household.conversationId, typing: false });
    await waitFor(() => lisa.typing.length === 2);
    await sleep(300);
    // One start (the other four are dropped) and the stop signal (separate budget).
    expect(lisa.typing.map((event) => event.typing).sort()).toEqual([false, true]);
  });
});
