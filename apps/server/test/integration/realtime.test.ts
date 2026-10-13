import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { SOCKET_PATH, type ClientToServerEvents, type ServerToClientEvents, type SyncEvent } from '@homi/shared';
import type { PrismaClient } from '../../src/db';
import { householdRoom } from '../../src/plugins/realtime';
import { buildTestApp, type TestApp } from '../helpers/app';
import { TEST_APP_URL } from '../helpers/config';
import { getTestPrisma } from '../helpers/db';
import { addMember, createHousehold, createLoggedInUser } from '../helpers/fixtures';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

async function waitFor(condition: () => Promise<boolean> | boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('waitFor: timed out');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function nextEvent<T>(register: (resolve: (value: T) => void) => void, timeoutMs = 5_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('event timeout')), timeoutMs);
    register((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

describe('Socket.IO realtime', () => {
  let t: TestApp;
  let baseUrl: string;
  const sockets: ClientSocket[] = [];
  const typingSeen: string[] = [];

  function open(headers: Record<string, string>): ClientSocket {
    const socket: ClientSocket = connect(baseUrl, {
      path: SOCKET_PATH,
      transports: ['websocket'],
      extraHeaders: headers,
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    return socket;
  }

  beforeAll(async () => {
    t = await buildTestApp({
      configure: (app) => {
        app.realtime.onConnection((socket) => {
          socket.on('chat:typing', (payload) => {
            typingSeen.push(`${socket.data.userId}:${payload.conversationId}`);
          });
        });
      },
    });
    baseUrl = await t.app.listen({ port: 0, host: '127.0.0.1' });
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
  });

  afterAll(async () => {
    const started = Date.now();
    await t.close();
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('rejects handshakes without a session', async () => {
    const socket = open({ origin: TEST_APP_URL });
    const error = await nextEvent<Error>((resolve) => socket.on('connect_error', resolve));
    expect(error.message).toBe('UNAUTHORIZED');
  });

  it('rejects foreign origins even with a valid session', async () => {
    const { client } = await createLoggedInUser(t.app);
    const socket = open({ origin: 'https://evil.example', cookie: client.cookieHeader() });
    const error = await nextEvent<Error>((resolve) => socket.on('connect_error', resolve));
    expect(error).toBeInstanceOf(Error);
    expect(socket.connected).toBe(false);
  });

  it('joins user and household rooms and delivers events', async () => {
    const owner = await createLoggedInUser(t.app, { displayName: 'Mia' });
    const household = await createHousehold(t.prisma, owner.user.id);

    const socket = open({ origin: TEST_APP_URL, cookie: owner.client.cookieHeader() });
    await nextEvent<void>((resolve) => socket.on('connect', () => resolve()));
    await waitFor(async () => (await t.app.realtime.io.in(householdRoom(household.id)).fetchSockets()).length === 1);

    const sync: SyncEvent = {
      householdId: household.id,
      scope: 'inventory',
      action: 'created',
      entityId: 'x',
      actorId: owner.user.id,
    };
    const received = nextEvent<SyncEvent>((resolve) => socket.on('sync', resolve));
    t.app.realtime.emitSync(sync);
    expect(await received).toEqual(sync);

    const membership = nextEvent((resolve) => socket.on('membership', resolve));
    t.app.realtime.emitToUsers([owner.user.id, owner.user.id], 'membership', {
      householdId: household.id,
      action: 'added',
    });
    expect(await membership).toEqual({ householdId: household.id, action: 'added' });

    // connection handlers registered by modules receive client events
    socket.emit('chat:typing', { conversationId: household.conversationId, typing: true });
    await waitFor(() => typingSeen.includes(`${owner.user.id}:${household.conversationId}`));
  });

  it('re-syncs household rooms after membership changes', async () => {
    const owner = await createLoggedInUser(t.app);
    const member = await createLoggedInUser(t.app);
    const household = await createHousehold(t.prisma, owner.user.id);

    const socket = open({ origin: TEST_APP_URL, cookie: member.client.cookieHeader() });
    await nextEvent<void>((resolve) => socket.on('connect', () => resolve()));
    const room = householdRoom(household.id);
    expect((await t.app.realtime.io.in(room).fetchSockets()).length).toBe(0);

    await addMember(t.prisma, household, member.user.id);
    await t.app.realtime.syncUserRooms(member.user.id);
    expect((await t.app.realtime.io.in(room).fetchSockets()).length).toBe(1);

    await t.prisma.householdMember.deleteMany({ where: { householdId: household.id, userId: member.user.id } });
    await t.app.realtime.syncUserRooms(member.user.id);
    expect((await t.app.realtime.io.in(room).fetchSockets()).length).toBe(0);
  });

  it('disconnects the sockets of a revoked session', async () => {
    const { client, user, sessionId } = await createLoggedInUser(t.app);
    const socket = open({ origin: TEST_APP_URL, cookie: client.cookieHeader() });
    await nextEvent<void>((resolve) => socket.on('connect', () => resolve()));

    const reason = nextEvent<string>((resolve) => socket.on('disconnect', resolve));
    await t.app.realtime.disconnectUser(user.id, { sessionId });
    expect(await reason).toBe('io server disconnect');
  });

  it('closes sockets whose session expired or was purged (security review: handshake-only check)', async () => {
    const stale = await createLoggedInUser(t.app);
    const fresh = await createLoggedInUser(t.app);
    const household = await createHousehold(t.prisma, stale.user.id);
    await addMember(t.prisma, household, fresh.user.id);

    const staleSocket = open({ origin: TEST_APP_URL, cookie: stale.client.cookieHeader() });
    const freshSocket = open({ origin: TEST_APP_URL, cookie: fresh.client.cookieHeader() });
    await Promise.all(
      [staleSocket, freshSocket].map((socket) => nextEvent<void>((resolve) => socket.on('connect', () => resolve()))),
    );

    // What the expired-session purge (or plain expiry) does: the rows go, the sockets stay open.
    await t.prisma.session.deleteMany({ where: { userId: stale.user.id } });
    const disconnected = nextEvent<string>((resolve) => staleSocket.on('disconnect', resolve));
    expect(await t.app.realtime.revalidateSessions()).toBe(1);
    expect(await disconnected).toBe('io server disconnect');
    expect(freshSocket.connected).toBe(true);

    // An expired (not yet purged) session counts as ended too.
    await t.prisma.session.updateMany({
      where: { userId: fresh.user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const freshGone = nextEvent<string>((resolve) => freshSocket.on('disconnect', resolve));
    expect(await t.app.realtime.revalidateSessions()).toBe(1);
    expect(await freshGone).toBe('io server disconnect');
  });

  it('delivers inventory events when the URL spells the household id in upper case', async () => {
    const owner = await createLoggedInUser(t.app);
    const member = await createLoggedInUser(t.app);
    const household = await createHousehold(t.prisma, owner.user.id);
    await addMember(t.prisma, household, member.user.id);
    const socket = open({ origin: TEST_APP_URL, cookie: member.client.cookieHeader() });
    await nextEvent<void>((resolve) => socket.on('connect', () => resolve()));
    await waitFor(async () => (await t.app.realtime.io.in(householdRoom(household.id)).fetchSockets()).length === 1);

    const received = nextEvent<SyncEvent>((resolve) => socket.on('sync', resolve));
    const response = await owner.client.post(`/api/households/${household.id.toUpperCase()}/items`, {
      name: 'Kaffee',
      category: 'KUECHE',
      quantity: '1',
      unit: 'PACKUNG',
    });
    expect(response.statusCode).toBe(201);
    expect(await received).toMatchObject({ householdId: household.id, scope: 'inventory', action: 'created' });
  });
});

/*
 * Review finding (households, low): the connect-time household join read the memberships, then
 * joined when the query returned – after a concurrent removal's `syncUserRooms` had already run –
 * so the ex-member stayed in `household:<id>` and kept receiving `sync` events. Room updates are now
 * serialised per user. The only instrumentation: the connect-time lookup result is handed back late
 * (the query itself runs immediately, i.e. it reads the pre-removal state).
 */
describe('Socket.IO room updates vs. concurrent membership removal', () => {
  let t: TestApp;
  let baseUrl: string;
  let delayUserId: string | null = null;
  const sockets: ClientSocket[] = [];

  function slowConnectLookupPrisma(): PrismaClient {
    const real = getTestPrisma();
    const members = real.householdMember;
    const delegate = new Proxy(members, {
      get(target, prop) {
        const value = Reflect.get(target, prop) as unknown;
        if (prop === 'findMany' && typeof value === 'function') {
          return async (args: { where?: { userId?: string } }) => {
            const result: unknown = await (value as (a: unknown) => Promise<unknown>).call(target, args);
            if (delayUserId !== null && args.where?.userId === delayUserId) {
              delayUserId = null;
              await new Promise((resolve) => setTimeout(resolve, 400));
            }
            return result;
          };
        }
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
    return new Proxy(real, {
      get(target, prop) {
        if (prop === 'householdMember') return delegate;
        const value = Reflect.get(target, prop) as unknown;
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
  }

  beforeAll(async () => {
    t = await buildTestApp({ prisma: slowConnectLookupPrisma() });
    baseUrl = await t.app.listen({ port: 0, host: '127.0.0.1' });
  });
  afterAll(async () => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    await t.close();
  });

  it('never leaves a member removed while their socket connects in the household room', async () => {
    const owner = await createLoggedInUser(t.app);
    const household = await createHousehold(t.prisma, owner.user.id);
    const member = await createLoggedInUser(t.app);
    await addMember(t.prisma, household, member.user.id);

    delayUserId = member.user.id;
    const socket: ClientSocket = connect(baseUrl, {
      path: SOCKET_PATH,
      transports: ['websocket'],
      extraHeaders: { origin: TEST_APP_URL, cookie: member.client.cookieHeader() },
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    const syncs: SyncEvent[] = [];
    socket.on('sync', (event) => syncs.push(event));
    await nextEvent<void>((resolve) => socket.on('connect', () => resolve()));

    // removed while the connect-time lookup (pre-removal state) is still "in flight"
    const removal = await owner.client.delete(`/api/households/${household.id}/members/${member.user.id}`);
    expect(removal.statusCode).toBe(204);
    await new Promise((resolve) => setTimeout(resolve, 600));

    const inRoom = await t.app.realtime.io.in(householdRoom(household.id)).fetchSockets();
    expect(inRoom.map((s) => s.data.userId)).not.toContain(member.user.id);
    syncs.length = 0;
    await owner.client.post(`/api/households/${household.id}/items`, { name: 'Geheim' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(syncs).toEqual([]);
  });
});
