import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import {
  MeResponseSchema,
  SESSION_COOKIE_NAME,
  SOCKET_PATH,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@homi/shared';
import type { LightMyRequestResponse } from 'fastify';
import { hashPassword } from '../../src/lib/passwords';
import { buildTestApp, type TestApp } from '../helpers/app';
import { TEST_APP_URL } from '../helpers/config';
import { addMember, createHousehold, createLoggedInUser, createUser } from '../helpers/fixtures';
import type { TestClient } from '../helpers/http';

const NEW_PASSWORD = 'Neues-Passwort-2026';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

async function login(client: TestClient, email: string, password: string) {
  const response = await client.post('/api/auth/login', { email, password });
  expect(response.statusCode).toBe(200);
  return response;
}

describe('account: profile', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await buildTestApp();
  });
  afterAll(() => t.close());

  it('updates the display name and answers with MeResponse', async () => {
    const { user, client } = await createLoggedInUser(t.app, { displayName: 'Julia' });
    const household = await createHousehold(t.prisma, user.id, 'WG Basel');
    const emitSync = vi.spyOn(t.app.realtime, 'emitSync');

    const response = await client.patch('/api/account', { displayName: '  Julia Meier  ' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const me = MeResponseSchema.parse(response.json());
    expect(me.user).toMatchObject({ id: user.id, displayName: 'Julia Meier', email: user.email });
    expect(me.households).toEqual([{ id: household.id, name: 'WG Basel', role: 'OWNER', memberCount: 1 }]);
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).displayName).toBe('Julia Meier');

    // Other members learn about the new name (member lists, chats).
    expect(emitSync).toHaveBeenCalledWith({
      householdId: household.id,
      scope: 'members',
      action: 'updated',
      entityId: user.id,
      actorId: user.id,
    });
  });

  it('validates the name and requires a session and the CSRF header', async () => {
    const { client } = await createLoggedInUser(t.app);
    const empty = await client.patch('/api/account', { displayName: '   ' });
    expect(empty.statusCode).toBe(400);
    expect(empty.json()).toMatchObject({
      error: { code: 'VALIDATION', details: { fieldErrors: { displayName: 'Bitte gib deinen Namen ein.' } } },
    });
    const tooLong = await client.patch('/api/account', { displayName: 'x'.repeat(61) });
    expect(tooLong.json().error.details.fieldErrors.displayName).toBe('Der Name darf höchstens 60 Zeichen lang sein.');

    expect((await t.client().patch('/api/account', { displayName: 'Anna' })).statusCode).toBe(401);
    const noCsrf = await client.patch('/api/account', { displayName: 'Anna' }, { csrf: false });
    expect(noCsrf.statusCode).toBe(403);
    expect(noCsrf.json().error.code).toBe('CSRF');
  });

  it('rejects NUL, control, zero-width-only and bidi names (no 500, nothing stored)', async () => {
    const { user, client } = await createLoggedInUser(t.app, { displayName: 'Julia' });
    const cases: Array<[string, string]> = [
      ['A\u0000B', 'Der Name enthält unzulässige Zeichen.'],
      ['Zeile1\nZeile2', 'Der Name enthält unzulässige Zeichen.'],
      ['Admin‮gnp.exe', 'Der Name enthält unzulässige Zeichen.'],
      ['Ju​lia', 'Der Name enthält unzulässige Zeichen.'],
      ['​​', 'Bitte gib deinen Namen ein.'],
      ['ㅤ', 'Bitte gib deinen Namen ein.'],
    ];
    for (const [displayName, message] of cases) {
      const response = await client.patch('/api/account', { displayName });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: { code: 'VALIDATION', details: { fieldErrors: { displayName: message } } },
      });
    }
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).displayName).toBe('Julia');

    const persian = await client.patch('/api/account', { displayName: 'می‌خواهم' });
    expect(persian.statusCode).toBe(200); // ZWNJ is part of the script, not hidden content
  });
});

describe('account: password change', () => {
  let t: TestApp;
  let baseUrl: string;

  beforeAll(async () => {
    t = await buildTestApp();
    baseUrl = await t.app.listen({ port: 0, host: '127.0.0.1' });
  });
  afterAll(() => t.close());

  function openSocket(client: TestClient): Promise<ClientSocket> {
    const socket: ClientSocket = connect(baseUrl, {
      path: SOCKET_PATH,
      transports: ['websocket'],
      extraHeaders: { origin: TEST_APP_URL, cookie: client.cookieHeader() },
      reconnection: false,
      forceNew: true,
    });
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });
  }

  it('changes the password, keeps the current session and revokes all others', async () => {
    const user = await createUser(t.prisma);
    const phone = t.client();
    const laptop = t.client();
    const tablet = t.client();
    await login(phone, user.email, user.password);
    await login(laptop, user.email, user.password);
    await login(tablet, user.email, user.password);
    const phoneSocket = await openSocket(phone);
    const laptopSocket = await openSocket(laptop);

    try {
      const laptopGone = new Promise<string>((resolve) => laptopSocket.once('disconnect', resolve));
      const response = await phone.post('/api/account/password', {
        currentPassword: user.password,
        newPassword: NEW_PASSWORD,
      });
      expect(response.statusCode).toBe(204);

      expect((await phone.get('/api/auth/me')).statusCode).toBe(200);
      expect((await laptop.get('/api/auth/me')).statusCode).toBe(401);
      expect((await tablet.get('/api/auth/me')).statusCode).toBe(401);
      expect(await t.prisma.session.count({ where: { userId: user.id } })).toBe(1);

      expect(await laptopGone).toBe('io server disconnect');
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(phoneSocket.connected).toBe(true);
    } finally {
      phoneSocket.disconnect();
      laptopSocket.disconnect();
    }

    expect((await t.client().post('/api/auth/login', { email: user.email, password: user.password })).statusCode).toBe(
      401,
    );
    await login(t.client(), user.email, NEW_PASSWORD);
  });

  it('rejects a wrong current password with a generic German error and changes nothing', async () => {
    const { user, client } = await createLoggedInUser(t.app);
    const other = t.client();
    await login(other, user.email, user.password);

    const response = await client.post('/api/account/password', {
      currentPassword: 'Falsches-Passwort-1',
      newPassword: NEW_PASSWORD,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: 'WRONG_PASSWORD', message: 'Das aktuelle Passwort ist falsch.' },
    });
    expect((await other.get('/api/auth/me')).statusCode).toBe(200);
    await login(t.client(), user.email, user.password);
  });

  it('validates the new password (policy, differs from current, not the e-mail)', async () => {
    const { user, client } = await createLoggedInUser(t.app);

    const weak = await client.post('/api/account/password', { currentPassword: user.password, newPassword: 'kurz' });
    expect(weak.statusCode).toBe(400);
    expect(weak.json().error.details.fieldErrors.newPassword).toBe(
      'Das Passwort muss mindestens 10 Zeichen lang sein.',
    );

    const same = await client.post('/api/account/password', {
      currentPassword: user.password,
      newPassword: user.password,
    });
    expect(same.json().error.details.fieldErrors.newPassword).toBe(
      'Das neue Passwort muss sich vom aktuellen unterscheiden.',
    );

    const email = await client.post('/api/account/password', {
      currentPassword: user.password,
      newPassword: user.email.toUpperCase(),
    });
    expect(email.statusCode).toBe(400);
    expect(email.json().error.details.fieldErrors.newPassword).toBe(
      'Das Passwort darf nicht deiner E-Mail-Adresse entsprechen.',
    );
  });

  it('requires a session and the CSRF header', async () => {
    const body = { currentPassword: 'Irgendwas-123', newPassword: NEW_PASSWORD };
    expect((await t.client().post('/api/account/password', body)).statusCode).toBe(401);
    const { client } = await createLoggedInUser(t.app);
    expect((await client.post('/api/account/password', body, { csrf: false })).statusCode).toBe(403);
  });

  it('does not overwrite a password that a reset set while the current one was being checked', async () => {
    // Regression: the change verified the old password, a reset committed, and the change then
    // replaced the reset password (and kept its own, already revoked session alive).
    const { user, client } = await createLoggedInUser(t.app);
    const resetHash = await hashPassword('Zurueckgesetzt-2026');

    let change: Promise<LightMyRequestResponse> | undefined;
    // This transaction plays the reset: it holds the user row like reset confirm does.
    await t.prisma.$transaction(
      async (tx) => {
        const [backend] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id}::uuid FOR UPDATE`;
        await tx.user.update({ where: { id: user.id }, data: { passwordHash: resetHash } });
        await tx.session.deleteMany({ where: { userId: user.id } });

        change = client.post('/api/account/password', { currentPassword: user.password, newPassword: NEW_PASSWORD });
        // Commit only once the change has verified the old password and waits for the row.
        await vi.waitFor(
          async () => {
            const [blocked] = await t.prisma.$queryRaw<Array<{ count: number }>>`
              SELECT count(*)::int AS count FROM pg_stat_activity
              WHERE ${backend!.pid}::int = ANY(pg_blocking_pids(pid))`;
            expect(blocked?.count).toBeGreaterThan(0);
          },
          { timeout: 10_000, interval: 20 },
        );
      },
      { timeout: 20_000 },
    );

    const response = await change!;
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('WRONG_PASSWORD');
    const stored = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
    expect(stored.passwordHash).toBe(resetHash);
    expect(await t.prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('cannot be reached through a percent-encoded /api prefix', async () => {
    const { user, client } = await createLoggedInUser(t.app);
    const body = { currentPassword: user.password, newPassword: NEW_PASSWORD };
    const noHeader = await client.post('/%61pi/account/password', body, {
      csrf: false,
      origin: 'https://sibling.example',
    });
    expect(noHeader.statusCode).toBe(403);
    expect((await client.post('/%61pi/account/password', body)).statusCode).toBe(404);
    expect((await client.patch('/%61pi/account', { displayName: 'Mallory' }, { csrf: false })).statusCode).toBe(403);
    await login(t.client(), user.email, user.password); // unchanged
  });
});

describe('account: password change rate limit', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await buildTestApp({ rateLimit: true });
  });
  afterAll(() => t.close());

  it('stops brute-forcing the current password with a stolen session', async () => {
    const { client } = await createLoggedInUser(t.app);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const response = await client.post('/api/account/password', {
        currentPassword: `Rateversuch-${i}`,
        newPassword: NEW_PASSWORD,
      });
      statuses.push(response.statusCode);
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(400));
    expect(statuses[10]).toBe(429);
  });
});

describe('account: active household', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await buildTestApp();
  });
  afterAll(() => t.close());

  it('persists the active household for members', async () => {
    const { user, client } = await createLoggedInUser(t.app);
    const first = await createHousehold(t.prisma, user.id, 'Zuhause');
    const owner = await createUser(t.prisma);
    const second = await createHousehold(t.prisma, owner.id, 'Ferienhaus');
    await addMember(t.prisma, second, user.id);

    const response = await client.put('/api/account/active-household', { householdId: second.id });
    expect(response.statusCode).toBe(204);
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).lastHouseholdId).toBe(second.id);
    expect(MeResponseSchema.parse((await client.get('/api/auth/me')).json()).activeHouseholdId).toBe(second.id);

    // Survives a new login (persisted server-side, not in the session).
    const fresh = t.client();
    const login = await fresh.post('/api/auth/login', { email: user.email, password: user.password });
    expect(login.json().activeHouseholdId).toBe(second.id);

    expect((await client.put('/api/account/active-household', { householdId: first.id })).statusCode).toBe(204);
    expect(MeResponseSchema.parse((await client.get('/api/auth/me')).json()).activeHouseholdId).toBe(first.id);
  });

  it('answers 404 for households the user does not belong to (existence is not revealed)', async () => {
    const { user, client } = await createLoggedInUser(t.app);
    await createHousehold(t.prisma, user.id);
    const stranger = await createUser(t.prisma);
    const foreign = await createHousehold(t.prisma, stranger.id, 'Fremd');

    const notMember = await client.put('/api/account/active-household', { householdId: foreign.id });
    expect(notMember.statusCode).toBe(404);
    expect(notMember.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Nicht gefunden.' } });

    const unknown = await client.put('/api/account/active-household', {
      householdId: '0f8fad5b-d9cb-469f-a165-70867728950e',
    });
    expect(unknown.statusCode).toBe(404);
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).lastHouseholdId).toBeNull();

    const malformed = await client.put('/api/account/active-household', { householdId: 'nope' });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.code).toBe('VALIDATION');
  });

  it('requires a session and the CSRF header', async () => {
    const { user, client } = await createLoggedInUser(t.app);
    const household = await createHousehold(t.prisma, user.id);
    expect((await t.client().put('/api/account/active-household', { householdId: household.id })).statusCode).toBe(401);
    expect(
      (await client.put('/api/account/active-household', { householdId: household.id }, { csrf: false })).statusCode,
    ).toBe(403);
    const stale = t.client().setCookie(SESSION_COOKIE_NAME, 'C'.repeat(43));
    expect((await stale.put('/api/account/active-household', { householdId: household.id })).statusCode).toBe(401);
  });
});
