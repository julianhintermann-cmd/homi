import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import {
  MeResponseSchema,
  PASSWORD_RESET_PATH_PREFIX,
  SESSION_COOKIE_NAME,
  SOCKET_PATH,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@homi/shared';
import type { LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../src/app';
import { createMailer } from '../../src/lib/mailer';
import { KEYED_RATE_LIMITS } from '../../src/lib/rate-limit';
import { hashToken } from '../../src/lib/tokens';
import { buildLoggerOptions } from '../../src/logger';
import { buildTestApp, type TestApp } from '../helpers/app';
import { createTestConfig, TEST_APP_URL, TEST_SESSION_SECRET } from '../helpers/config';
import { getTestPrisma } from '../helpers/db';
import { addMember, createHousehold, createLoggedInUser, createUser } from '../helpers/fixtures';
import { TestClient } from '../helpers/http';

const PASSWORD = 'Sommer-Wiese-2026';
const NEW_PASSWORD = 'Herbst-Laub-2027!';
const DAY_SECONDS = 24 * 60 * 60;

let emailCounter = 0;
function uniqueEmail(prefix = 'person'): string {
  emailCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${emailCounter}@example.ch`;
}

function sessionCookie(response: LightMyRequestResponse) {
  return response.cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME);
}

async function register(
  client: TestClient,
  overrides: Partial<{ displayName: string; email: string; password: string }> = {},
) {
  return client.post('/api/auth/register', {
    displayName: 'Julia',
    email: uniqueEmail(),
    password: PASSWORD,
    ...overrides,
  });
}

/** Extracts the raw token from the reset link of the last mail sent to `to`. */
function resetTokenFromMail(t: TestApp, to: string): string {
  const mail = [...t.mailer.sent].reverse().find((message) => message.to === to);
  if (!mail) throw new Error(`no mail sent to ${to}`);
  const match = new RegExp(`${TEST_APP_URL}${PASSWORD_RESET_PATH_PREFIX}([A-Za-z0-9_-]+)`).exec(mail.text);
  if (!match?.[1]) throw new Error('no reset link in mail');
  return match[1];
}

describe('auth: register, login, me, logout', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await buildTestApp();
  });
  afterAll(() => t.close());

  it('runs the full session lifecycle', async () => {
    const client = t.client();
    const email = uniqueEmail('lifecycle');

    const registered = await register(client, { email, displayName: '  Julia Muster  ' });
    expect(registered.statusCode).toBe(201);
    expect(registered.headers['cache-control']).toBe('no-store');
    const me = MeResponseSchema.parse(registered.json());
    expect(me).toMatchObject({ user: { displayName: 'Julia Muster', email }, households: [], activeHouseholdId: null });
    expect(client.sessionToken).toBeDefined();

    const meResponse = await client.get('/api/auth/me');
    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.json()).toEqual(me);

    const token = client.sessionToken!;
    const logout = await client.post('/api/auth/logout');
    expect(logout.statusCode).toBe(204);
    expect(sessionCookie(logout)?.value).toBe('');
    expect(client.sessionToken).toBeUndefined();
    expect((await client.get('/api/auth/me')).statusCode).toBe(401);

    // The old cookie is dead server-side, not just forgotten by the browser.
    const replay = t.client().setCookie(SESSION_COOKIE_NAME, token);
    expect((await replay.get('/api/auth/me')).statusCode).toBe(401);
    expect(await t.prisma.session.count({ where: { userId: me.user.id } })).toBe(0);

    const login = await client.post('/api/auth/login', { email: email.toUpperCase(), password: PASSWORD });
    expect(login.statusCode).toBe(200);
    expect(MeResponseSchema.parse(login.json()).user.id).toBe(me.user.id);
    expect((await client.get('/api/auth/me')).statusCode).toBe(200);
  });

  it('normalises the e-mail address and stores an Argon2id hash only', async () => {
    const email = uniqueEmail('Case');
    const response = await register(t.client(), { email: `  ${email.toUpperCase()}  ` });
    expect(response.statusCode).toBe(201);
    const row = await t.prisma.user.findUniqueOrThrow({ where: { email: email.toLowerCase() } });
    expect(row.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(row.passwordHash).not.toContain(PASSWORD);
  });

  it('rejects a duplicate e-mail address with 409 EMAIL_TAKEN', async () => {
    const email = uniqueEmail('dup');
    expect((await register(t.client(), { email })).statusCode).toBe(201);
    const duplicate = await register(t.client(), { email: email.toUpperCase() });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({
      error: { code: 'EMAIL_TAKEN', message: 'Für diese E-Mail-Adresse existiert bereits ein Konto.' },
    });
    expect(sessionCookie(duplicate)).toBeUndefined();
  });

  it('validates registrations on the server (password policy, e-mail, name)', async () => {
    const weak = await register(t.client(), { password: 'kurz1' });
    expect(weak.statusCode).toBe(400);
    expect(weak.json()).toMatchObject({
      error: {
        code: 'VALIDATION',
        details: { fieldErrors: { password: 'Das Passwort muss mindestens 10 Zeichen lang sein.' } },
      },
    });

    const lettersOnly = await register(t.client(), { password: 'nurbuchstaben' });
    expect(lettersOnly.json().error.details.fieldErrors.password).toBe(
      'Das Passwort muss mindestens eine Ziffer oder ein Sonderzeichen enthalten.',
    );

    const email = uniqueEmail('same');
    const sameAsEmail = await register(t.client(), { email, password: email.toUpperCase() });
    expect(sameAsEmail.json().error.details.fieldErrors.password).toBe(
      'Das Passwort darf nicht deiner E-Mail-Adresse entsprechen.',
    );

    const invalid = await t
      .client()
      .post('/api/auth/register', { displayName: ' ', email: 'kein-mail', password: PASSWORD });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.details.fieldErrors).toMatchObject({
      displayName: 'Bitte gib deinen Namen ein.',
      email: 'Bitte gib eine gültige E-Mail-Adresse ein.',
    });

    expect((await t.client().post('/api/auth/register')).statusCode).toBe(400);
    expect(await t.prisma.user.count({ where: { email } })).toBe(0);
  });

  it('answers wrong passwords and unknown accounts with the same generic error', async () => {
    const user = await createUser(t.prisma, { email: uniqueEmail('login') });

    const wrong = await t.client().post('/api/auth/login', { email: user.email, password: 'Falsches-Passwort-1' });
    const unknown = await t
      .client()
      .post('/api/auth/login', { email: uniqueEmail('ghost'), password: 'Irgendwas-123' });
    for (const response of [wrong, unknown]) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: { code: 'INVALID_CREDENTIALS', message: 'E-Mail oder Passwort ist falsch.' },
      });
      expect(sessionCookie(response)).toBeUndefined();
    }

    const ok = await t.client().post('/api/auth/login', { email: user.email, password: user.password });
    expect(ok.statusCode).toBe(200);
  });

  it('sets the session cookie HttpOnly, SameSite=Lax, Path=/, with Max-Age and without Secure outside production', async () => {
    const response = await register(t.client());
    const cookie = sessionCookie(response);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 30 * DAY_SECONDS });
    expect(cookie?.secure).toBeUndefined();
    expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Only the HMAC of the token is stored.
    const stored = await t.prisma.session.findUnique({
      where: { tokenHash: hashToken(TEST_SESSION_SECRET, cookie!.value) },
    });
    expect(stored).not.toBeNull();
    expect(await t.prisma.session.count({ where: { tokenHash: cookie!.value } })).toBe(0);
  });

  it('keeps the session across requests and issues a new one per login (session fixation)', async () => {
    const user = await createUser(t.prisma, { email: uniqueEmail('fixation') });
    const client = t.client();
    const first = await client.post('/api/auth/login', { email: user.email, password: user.password });
    expect(first.statusCode).toBe(200);
    const firstToken = client.sessionToken!;
    for (let i = 0; i < 3; i += 1) expect((await client.get('/api/auth/me')).statusCode).toBe(200);
    expect(client.sessionToken).toBe(firstToken);

    // Logging in again with the existing cookie replaces (not reuses) the session.
    const second = await client.post('/api/auth/login', { email: user.email, password: user.password });
    expect(second.statusCode).toBe(200);
    expect(client.sessionToken).not.toBe(firstToken);
    expect((await t.client().setCookie(SESSION_COOKIE_NAME, firstToken).get('/api/auth/me')).statusCode).toBe(401);
    expect(await t.prisma.session.count({ where: { userId: user.id } })).toBe(1);

    // A planted cookie of another account is destroyed as well.
    const victim = await createUser(t.prisma, { email: uniqueEmail('victim') });
    const planted = await createLoggedInUser(t.app, { email: uniqueEmail('attacker') });
    const login = await planted.client.post('/api/auth/login', { email: victim.email, password: victim.password });
    expect(login.json().user.id).toBe(victim.id);
    expect(await t.prisma.session.count({ where: { id: planted.sessionId } })).toBe(0);
  });

  it('logout is idempotent and only ends the current session', async () => {
    const anonymous = await t.client().post('/api/auth/logout');
    expect(anonymous.statusCode).toBe(204);

    const user = await createUser(t.prisma, { email: uniqueEmail('devices') });
    const phone = t.client();
    const laptop = t.client();
    await phone.post('/api/auth/login', { email: user.email, password: user.password });
    await laptop.post('/api/auth/login', { email: user.email, password: user.password });

    expect((await phone.post('/api/auth/logout')).statusCode).toBe(204);
    expect((await phone.post('/api/auth/logout')).statusCode).toBe(204);
    expect((await phone.get('/api/auth/me')).statusCode).toBe(401);
    expect((await laptop.get('/api/auth/me')).statusCode).toBe(200);
  });

  it('requires the CSRF header (and a same-origin Origin) on every auth mutation', async () => {
    const user = await createUser(t.prisma, { email: uniqueEmail('csrf') });
    const body = { email: user.email, password: user.password };

    const noHeader = await t.client().post('/api/auth/login', body, { csrf: false });
    expect(noHeader.statusCode).toBe(403);
    expect(noHeader.json()).toMatchObject({ error: { code: 'CSRF' } });
    expect(sessionCookie(noHeader)).toBeUndefined();

    const foreign = await t.client().post('/api/auth/login', body, { origin: 'https://evil.example' });
    expect(foreign.statusCode).toBe(403);

    expect(
      (
        await t
          .client()
          .post('/api/auth/register', { displayName: 'X', email: uniqueEmail(), password: PASSWORD }, { csrf: false })
      ).statusCode,
    ).toBe(403);
    expect(
      (await t.client().post('/api/auth/password-reset/request', { email: user.email }, { csrf: false })).statusCode,
    ).toBe(403);

    const { client } = await createLoggedInUser(t.app);
    expect((await client.post('/api/auth/logout', undefined, { csrf: false })).statusCode).toBe(403);
    expect((await client.get('/api/auth/me')).statusCode).toBe(200); // still logged in
  });

  it('cannot be bypassed with a percent-encoded /api prefix (CSRF and session hooks)', async () => {
    // Regression: `/%61pi/...` skipped both global hooks (raw-URL prefix test) while the router
    // decoded it – a foreign origin could log a victim out or log in without the CSRF header.
    const { user, client } = await createLoggedInUser(t.app);
    const foreignOrigin = {
      csrf: false,
      origin: 'https://sibling.example',
      headers: { 'sec-fetch-site': 'same-site' },
    };

    const logout = await client.post('/%61pi/auth/logout', undefined, foreignOrigin);
    expect(logout.statusCode).toBe(403);
    expect(logout.json()).toMatchObject({ error: { code: 'CSRF' } });
    expect((await client.get('/api/auth/me')).statusCode).toBe(200); // session untouched

    const victim = await createUser(t.prisma, { email: uniqueEmail('encoded') });
    const login = await t
      .client()
      .post('/%61pi/auth/login', { email: victim.email, password: victim.password }, foreignOrigin);
    expect(login.statusCode).toBe(403);
    expect(sessionCookie(login)).toBeUndefined();
    for (const path of ['/%61pi/auth/register', '/%61pi/auth/password-reset/request', '/%2561pi/auth/logout']) {
      expect([403, 404]).toContain((await client.post(path, { email: victim.email }, { csrf: false })).statusCode);
    }

    // Even with the CSRF header the encoded prefix fails closed (the session hook did not run).
    const withHeader = await client.post('/%61pi/auth/logout');
    expect(withHeader.statusCode).toBe(404);
    expect((await client.get('/%61pi/auth/me')).statusCode).toBe(404);
    expect((await client.get('/api/auth/me')).statusCode).toBe(200);
    expect(await t.prisma.session.count({ where: { userId: user.id } })).toBe(1);
  });

  it('rejects control, invisible and bidi characters in the display name', async () => {
    const nul = await register(t.client(), { displayName: 'Ju\u0000lia' });
    expect(nul.statusCode).toBe(400); // was a 500 (Postgres rejects NUL bytes)
    expect(nul.json()).toMatchObject({
      error: { code: 'VALIDATION', details: { fieldErrors: { displayName: 'Der Name enthält unzulässige Zeichen.' } } },
    });
    const invisible = await register(t.client(), { displayName: '​⠀ㅤ' });
    expect(invisible.json().error.details.fieldErrors.displayName).toBe('Bitte gib deinen Namen ein.');
    const bidi = await register(t.client(), { displayName: 'Admin‮gnp.exe' });
    expect(bidi.json().error.details.fieldErrors.displayName).toBe('Der Name enthält unzulässige Zeichen.');

    const emoji = await register(t.client(), { displayName: 'Julia \u{1F469}‍\u{1F4BB}' });
    expect(emoji.statusCode).toBe(201);
    expect(emoji.json().user.displayName).toBe('Julia \u{1F469}‍\u{1F4BB}');
    const decomposed = await register(t.client(), { displayName: 'René' });
    expect(decomposed.json().user.displayName).toBe('René'); // stored NFC-normalised
  });

  it('builds /auth/me from the memberships: member counts and the active household', async () => {
    const { user, client } = await createLoggedInUser(t.app, { displayName: 'Anna' });
    const other = await createUser(t.prisma);
    const first = await createHousehold(t.prisma, user.id, 'WG Bern');
    const second = await createHousehold(t.prisma, other.id, 'Familie');
    await addMember(t.prisma, second, user.id, 'ADMIN');

    let me = MeResponseSchema.parse((await client.get('/api/auth/me')).json());
    expect(me.households).toEqual([
      { id: first.id, name: 'WG Bern', role: 'OWNER', memberCount: 1 },
      { id: second.id, name: 'Familie', role: 'ADMIN', memberCount: 2 },
    ]);
    expect(me.activeHouseholdId).toBe(first.id); // no lastHouseholdId → first membership

    await t.prisma.user.update({ where: { id: user.id }, data: { lastHouseholdId: second.id } });
    me = MeResponseSchema.parse((await client.get('/api/auth/me')).json());
    expect(me.activeHouseholdId).toBe(second.id);

    // Removed from the last household → falls back to the first membership.
    await t.prisma.householdMember.deleteMany({ where: { householdId: second.id, userId: user.id } });
    me = MeResponseSchema.parse((await client.get('/api/auth/me')).json());
    expect(me.activeHouseholdId).toBe(first.id);
    expect(me.households).toHaveLength(1);

    expect((await t.client().get('/api/auth/me')).json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Bitte melde dich an.' },
    });
  });

  it('disconnects the sockets of a session on logout', async () => {
    const baseUrl = await t.app.listen({ port: 0, host: '127.0.0.1' });
    const { client } = await createLoggedInUser(t.app);
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = connect(baseUrl, {
      path: SOCKET_PATH,
      transports: ['websocket'],
      extraHeaders: { origin: TEST_APP_URL, cookie: client.cookieHeader() },
      reconnection: false,
      forceNew: true,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      const disconnected = new Promise<string>((resolve) => socket.once('disconnect', resolve));
      expect((await client.post('/api/auth/logout')).statusCode).toBe(204);
      expect(await disconnected).toBe('io server disconnect');
    } finally {
      socket.disconnect();
    }
  });
});

describe('auth: production cookie', () => {
  let t: TestApp;

  beforeAll(async () => {
    // APP_URL in tests is http://localhost:5173, so COOKIE_SECURE=auto would not set Secure; force it here.
    t = await buildTestApp({ env: { NODE_ENV: 'production', COOKIE_SECURE: 'true' } });
  });
  afterAll(() => t.close());

  it('marks the session cookie Secure in production', async () => {
    const response = await register(t.client());
    expect(response.statusCode).toBe(201);
    expect(sessionCookie(response)).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/', secure: true });
    expect(String(response.headers['set-cookie'])).toMatch(/; Secure/);
  });
});

describe('auth: rate limits', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await buildTestApp({ rateLimit: true });
  });
  afterAll(() => t.close());

  it('limits logins to 10 per minute per IP', async () => {
    const client = t.client();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const response = await client.post(
        '/api/auth/login',
        { email: uniqueEmail('ip'), password: 'Falsch-12345' },
        { remoteAddress: '203.0.113.10' },
      );
      statuses.push(response.statusCode);
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(statuses[10]).toBe(429);
    // Another IP is not affected.
    const other = await client.post(
      '/api/auth/login',
      { email: uniqueEmail('ip'), password: 'Falsch-12345' },
      { remoteAddress: '203.0.113.11' },
    );
    expect(other.statusCode).toBe(401);
  });

  it('limits failed logins to 5 per minute per e-mail address and IP', async () => {
    const user = await createUser(t.prisma, { email: uniqueEmail('target') });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const response = await t
        .client()
        .post('/api/auth/login', { email: user.email, password: 'Falsch-12345' }, { remoteAddress: '198.51.100.7' });
      statuses.push(response.statusCode);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401]);

    // From that address even the correct password is refused while it is locked …
    const limited = await t
      .client()
      .post(
        '/api/auth/login',
        { email: user.email.toUpperCase(), password: user.password },
        { remoteAddress: '198.51.100.7' },
      );
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({
      error: { code: 'RATE_LIMITED', details: { retryAfterSeconds: expect.any(Number) } },
    });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(sessionCookie(limited)).toBeUndefined();

    // … but the owner on another network is not locked out by it.
    const owner = await t
      .client()
      .post('/api/auth/login', { email: user.email, password: user.password }, { remoteAddress: '198.51.100.99' });
    expect(owner.statusCode).toBe(200);
  });

  it('does not let wrong passwords from many IPs lock the owner out (security review: lockout)', async () => {
    const user = await createUser(t.prisma, { email: uniqueEmail('victim') });
    for (let i = 0; i < 5; i += 1) {
      const response = await t
        .client()
        .post(
          '/api/auth/login',
          { email: user.email, password: 'Falsch-12345' },
          { remoteAddress: `198.51.101.${i + 1}` },
        );
      expect(response.statusCode).toBe(401);
    }
    const owner = await t
      .client()
      .post('/api/auth/login', { email: user.email, password: user.password }, { remoteAddress: '198.51.101.200' });
    expect(owner.statusCode).toBe(200);
  });

  it('caps failed logins per e-mail address across all IPs at 50 per 15 minutes', async () => {
    const user = await createUser(t.prisma, { email: uniqueEmail('spray') });
    const { max } = KEYED_RATE_LIMITS.loginPerEmail;
    const statuses: number[] = [];
    for (let i = 0; i <= max; i += 1) {
      const response = await t
        .client()
        .post(
          '/api/auth/login',
          { email: user.email, password: 'Falsch-12345' },
          { remoteAddress: `198.18.${Math.floor(i / 4)}.${(i % 4) + 1}` },
        );
      statuses.push(response.statusCode);
    }
    expect(statuses.slice(0, max)).toEqual(Array(max).fill(401));
    expect(statuses[max]).toBe(429);
  });

  it('limits registrations to 5 per minute per IP', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const response = await t
        .client()
        .post(
          '/api/auth/register',
          { displayName: 'Bot', email: uniqueEmail('reg'), password: PASSWORD },
          { remoteAddress: '192.0.2.50' },
        );
      statuses.push(response.statusCode);
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
  });

  it('limits password reset requests to 3 per 15 minutes per IP', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const response = await t
        .client()
        .post('/api/auth/password-reset/request', { email: uniqueEmail('reset') }, { remoteAddress: '192.0.2.60' });
      statuses.push(response.statusCode);
    }
    expect(statuses).toEqual([202, 202, 202, 429]);
  });
});

describe('auth: password reset', () => {
  let t: TestApp;
  const logLines: string[] = [];

  beforeAll(async () => {
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        logLines.push(chunk.toString('utf8'));
        callback();
      },
    });
    // The production logger setup (redaction, URL sanitising) at trace level, captured in memory.
    const loggerOptions = buildLoggerOptions(createTestConfig({ LOG_LEVEL: 'trace' }));
    if (typeof loggerOptions !== 'object') throw new Error('unexpected logger options');
    t = await buildTestApp({ logger: { ...loggerOptions, stream } });
  });
  afterAll(() => t.close());

  async function requestReset(email: string): Promise<string> {
    const before = t.mailer.sent.length;
    const response = await t.client().post('/api/auth/password-reset/request', { email });
    expect(response.statusCode).toBe(202);
    expect(response.body).toBe('');
    await vi.waitFor(() => expect(t.mailer.sent.length).toBe(before + 1));
    return resetTokenFromMail(t, email.trim().toLowerCase());
  }

  it('reports the reset feature as enabled when mail is configured', async () => {
    const response = await t.client().get('/api/auth/config');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ passwordResetEnabled: true });
  });

  it('resets the password end to end: single-use token, all sessions revoked', async () => {
    const user = await createUser(t.prisma, { email: uniqueEmail('reset'), displayName: 'Lisa <b>' });
    const phone = t.client();
    const laptop = t.client();
    await phone.post('/api/auth/login', { email: user.email, password: user.password });
    await laptop.post('/api/auth/login', { email: user.email, password: user.password });

    const token = await requestReset(` ${user.email.toUpperCase()} `);
    const mail = t.mailer.sent.at(-1)!;
    expect(mail.to).toBe(user.email);
    expect(mail.subject).toBe('Homi: Passwort zurücksetzen');
    expect(mail.text).toContain('Hallo Lisa <b>');
    expect(mail.text).toContain(`${TEST_APP_URL}${PASSWORD_RESET_PATH_PREFIX}${token}`);
    expect(mail.text).toContain('60 Minuten gültig');
    expect(mail.html).toContain('Hallo Lisa &lt;b&gt;'); // user input is escaped in HTML
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // Only the HMAC is stored, valid for 60 minutes.
    const row = await t.prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.tokenHash).toBe(hashToken(TEST_SESSION_SECRET, token));
    expect(row.usedAt).toBeNull();
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(60 * 60 * 1000);

    const confirm = await t.client().post('/api/auth/password-reset/confirm', { token, password: NEW_PASSWORD });
    expect(confirm.statusCode).toBe(204);

    expect(await t.prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect((await phone.get('/api/auth/me')).statusCode).toBe(401);
    expect((await laptop.get('/api/auth/me')).statusCode).toBe(401);

    expect((await t.client().post('/api/auth/login', { email: user.email, password: user.password })).statusCode).toBe(
      401,
    );
    expect((await t.client().post('/api/auth/login', { email: user.email, password: NEW_PASSWORD })).statusCode).toBe(
      200,
    );

    const reuse = await t.client().post('/api/auth/password-reset/confirm', { token, password: 'Noch-ein-Passwort-9' });
    expect(reuse.statusCode).toBe(400);
    expect(reuse.json()).toEqual({
      error: { code: 'INVALID_TOKEN', message: 'Der Link ist ungültig oder abgelaufen.' },
    });
    expect((await t.client().post('/api/auth/login', { email: user.email, password: NEW_PASSWORD })).statusCode).toBe(
      200,
    );
  });

  it('never logs the raw token or passwords', () => {
    const logs = logLines.join('');
    expect(logs).toContain('password reset mail sent');
    expect(logs).toContain('password reset completed');
    for (const token of t.mailer.sent.map((mail) => /zuruecksetzen\/([A-Za-z0-9_-]+)/.exec(mail.text)?.[1])) {
      expect(token).toBeDefined();
      expect(logs).not.toContain(token);
    }
    expect(logs).not.toContain(NEW_PASSWORD);
  });

  it('answers 202 for unknown addresses without sending anything', async () => {
    const before = t.mailer.sent.length;
    const response = await t.client().post('/api/auth/password-reset/request', { email: uniqueEmail('nobody') });
    expect(response.statusCode).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(t.mailer.sent.length).toBe(before);
  });

  it('invalidates older tokens when a new link is requested', async () => {
    const user = await createUser(t.prisma, { email: uniqueEmail('twice') });
    const first = await requestReset(user.email);
    const second = await requestReset(user.email);
    expect(second).not.toBe(first);

    const stale = await t.client().post('/api/auth/password-reset/confirm', { token: first, password: NEW_PASSWORD });
    expect(stale.statusCode).toBe(400);
    expect(stale.json().error.code).toBe('INVALID_TOKEN');
    const fresh = await t.client().post('/api/auth/password-reset/confirm', { token: second, password: NEW_PASSWORD });
    expect(fresh.statusCode).toBe(204);
  });

  it('rejects expired, unknown and malformed tokens', async () => {
    const user = await createUser(t.prisma, { email: uniqueEmail('expired') });
    const token = await requestReset(user.email);
    await t.prisma.passwordResetToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await t.client().post('/api/auth/password-reset/confirm', { token, password: NEW_PASSWORD });
    expect(expired.statusCode).toBe(400);
    expect(expired.json().error.code).toBe('INVALID_TOKEN');
    expect((await t.client().post('/api/auth/login', { email: user.email, password: user.password })).statusCode).toBe(
      200,
    );

    const unknown = await t
      .client()
      .post('/api/auth/password-reset/confirm', { token: 'A'.repeat(43), password: NEW_PASSWORD });
    expect(unknown.json().error.code).toBe('INVALID_TOKEN');

    const malformed = await t
      .client()
      .post('/api/auth/password-reset/confirm', { token: '../etc', password: NEW_PASSWORD });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.code).toBe('VALIDATION');
  });

  it('enforces the password policy (incl. not equal to the e-mail) without using up the token', async () => {
    const user = await createUser(t.prisma, { email: uniqueEmail('policy') });
    const token = await requestReset(user.email);

    const weak = await t.client().post('/api/auth/password-reset/confirm', { token, password: 'kurz' });
    expect(weak.statusCode).toBe(400);
    expect(weak.json().error.code).toBe('VALIDATION');

    const sameAsEmail = await t.client().post('/api/auth/password-reset/confirm', { token, password: user.email });
    expect(sameAsEmail.statusCode).toBe(400);
    expect(sameAsEmail.json().error.details.fieldErrors.password).toBe(
      'Das Passwort darf nicht deiner E-Mail-Adresse entsprechen.',
    );

    expect(
      (await t.client().post('/api/auth/password-reset/confirm', { token, password: NEW_PASSWORD })).statusCode,
    ).toBe(204);
  });

  it('requires the CSRF header on confirm', async () => {
    const response = await t
      .client()
      .post('/api/auth/password-reset/confirm', { token: 'A'.repeat(43), password: NEW_PASSWORD }, { csrf: false });
    expect(response.statusCode).toBe(403);
  });
});

describe('auth: password reset without mail configuration', () => {
  it('reports the feature as disabled and never creates tokens', async () => {
    const config = createTestConfig();
    const prisma = getTestPrisma();
    const app = await buildApp({
      config,
      prisma,
      mailer: createMailer(null),
      logger: false,
      serveStatic: false,
      rateLimit: false,
    });
    await app.ready();
    try {
      const client = new TestClient(app);
      expect((await client.get('/api/auth/config')).json()).toEqual({ passwordResetEnabled: false });

      const user = await createUser(prisma, { email: uniqueEmail('nomail') });
      const response = await client.post('/api/auth/password-reset/request', { email: user.email });
      expect(response.statusCode).toBe(202);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(0);
    } finally {
      await app.close();
    }
  });
});

describe('auth: logins racing a password reset or change', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await buildTestApp();
  });
  afterAll(() => t.close());

  async function requestReset(email: string): Promise<string> {
    const before = t.mailer.sent.length;
    expect((await t.client().post('/api/auth/password-reset/request', { email })).statusCode).toBe(202);
    await vi.waitFor(() => expect(t.mailer.sent.length).toBe(before + 1));
    return resetTokenFromMail(t, email);
  }

  /**
   * Holds `sessions.create` for `userId` – i.e. a login that has already verified the password
   * waits right before it stores its session – until `release()` is called.
   */
  function pauseSessionCreation(userId: string) {
    const sessions = t.app.sessions;
    const original = sessions.create.bind(sessions);
    let signalReached = (): void => undefined;
    let openGate = (): void => undefined;
    const reached = new Promise<void>((resolve) => {
      signalReached = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    sessions.create = async (id, meta) => {
      if (id === userId) {
        signalReached();
        await gate;
      }
      return original(id, meta);
    };
    return {
      reached,
      release(): void {
        sessions.create = original;
        openGate();
      },
    };
  }

  async function startLogins(clients: TestClient[], email: string): Promise<Array<Promise<LightMyRequestResponse>>> {
    const logins: Array<Promise<LightMyRequestResponse>> = [];
    for (const client of clients) {
      logins.push(client.post('/api/auth/login', { email, password: PASSWORD }));
      await new Promise((resolve) => setTimeout(resolve, 3));
    }
    return logins;
  }

  it('a login that verified the old password while a reset committed gets no session', async () => {
    const user = await createUser(t.prisma, { email: uniqueEmail('race-reset'), password: PASSWORD });
    const token = await requestReset(user.email);

    const attacker = t.client();
    const pause = pauseSessionCreation(user.id);
    try {
      const login = attacker.post('/api/auth/login', { email: user.email, password: PASSWORD });
      await pause.reached; // the old password is verified, the session is not stored yet
      const confirm = await t.client().post('/api/auth/password-reset/confirm', { token, password: NEW_PASSWORD });
      expect(confirm.statusCode).toBe(204);
      pause.release();

      const response = await login;
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: { code: 'INVALID_CREDENTIALS', message: 'E-Mail oder Passwort ist falsch.' },
      });
      expect(sessionCookie(response)).toBeUndefined();
    } finally {
      pause.release();
    }
    expect(await t.prisma.session.count({ where: { userId: user.id } })).toBe(0);
    const fresh = await t.client().post('/api/auth/login', { email: user.email, password: NEW_PASSWORD });
    expect(fresh.statusCode).toBe(200);
  });

  it('a login that verified the old password while a password change committed gets no session', async () => {
    const {
      user,
      client: owner,
      sessionId,
    } = await createLoggedInUser(t.app, { email: uniqueEmail('race-change'), password: PASSWORD });

    const attacker = t.client();
    const pause = pauseSessionCreation(user.id);
    try {
      const login = attacker.post('/api/auth/login', { email: user.email, password: PASSWORD });
      await pause.reached;
      const change = await owner.post('/api/account/password', {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      });
      expect(change.statusCode).toBe(204);
      pause.release();

      const response = await login;
      expect(response.statusCode).toBe(401);
      expect(sessionCookie(response)).toBeUndefined();
    } finally {
      pause.release();
    }
    // Only the session that changed the password is left.
    const sessions = await t.prisma.session.findMany({ where: { userId: user.id }, select: { id: true } });
    expect(sessions).toEqual([{ id: sessionId }]);
    expect((await owner.get('/api/auth/me')).statusCode).toBe(200);
  });

  it('keeps no old-password session when many logins run during a reset', async () => {
    const user = await createUser(t.prisma, { email: uniqueEmail('race-burst'), password: PASSWORD });
    const token = await requestReset(user.email);

    const attackers = Array.from({ length: 20 }, () => t.client());
    const confirm = t.client().post('/api/auth/password-reset/confirm', { token, password: NEW_PASSWORD });
    const logins = await startLogins(attackers, user.email);
    expect((await confirm).statusCode).toBe(204);
    await Promise.all(logins);

    for (const attacker of attackers) expect((await attacker.get('/api/auth/me')).statusCode).toBe(401);
    expect(await t.prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('keeps no old-password session when many logins run during a password change', async () => {
    const {
      user,
      client: owner,
      sessionId,
    } = await createLoggedInUser(t.app, { email: uniqueEmail('race-burst-change'), password: PASSWORD });

    const attackers = Array.from({ length: 20 }, () => t.client());
    const change = owner.post('/api/account/password', { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    const logins = await startLogins(attackers, user.email);
    expect((await change).statusCode).toBe(204);
    await Promise.all(logins);

    for (const attacker of attackers) expect((await attacker.get('/api/auth/me')).statusCode).toBe(401);
    const sessions = await t.prisma.session.findMany({ where: { userId: user.id }, select: { id: true } });
    expect(sessions).toEqual([{ id: sessionId }]);
  });

  it('leaves exactly one valid reset token when requests arrive at the same time', async () => {
    const user = await createUser(t.prisma, { email: uniqueEmail('race-tokens') });
    const before = t.mailer.sent.length;
    const responses = await Promise.all(
      ['10.0.0.1', '10.0.0.2', '10.0.0.3'].map((remoteAddress) =>
        t.client().post('/api/auth/password-reset/request', { email: user.email }, { remoteAddress }),
      ),
    );
    expect(responses.map((response) => response.statusCode)).toEqual([202, 202, 202]);
    await vi.waitFor(() => expect(t.mailer.sent.length).toBe(before + 3));

    const mailed = t.mailer.sent
      .slice(before)
      .map((mail) => /zuruecksetzen\/([A-Za-z0-9_-]+)/.exec(mail.text)?.[1])
      .filter((token): token is string => token !== undefined);
    expect(mailed).toHaveLength(3);
    const valid = await t.prisma.passwordResetToken.findMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      select: { tokenHash: true },
    });
    expect(valid).toHaveLength(1);
    const [validToken, ...others] = [
      ...mailed.filter((token) => hashToken(TEST_SESSION_SECRET, token) === valid[0]?.tokenHash),
      ...mailed.filter((token) => hashToken(TEST_SESSION_SECRET, token) !== valid[0]?.tokenHash),
    ];
    expect(others).toHaveLength(2);

    // Only that link works.
    for (const token of others) {
      const stale = await t.client().post('/api/auth/password-reset/confirm', { token, password: NEW_PASSWORD });
      expect(stale.json().error.code).toBe('INVALID_TOKEN');
    }
    const fresh = await t
      .client()
      .post('/api/auth/password-reset/confirm', { token: validToken, password: NEW_PASSWORD });
    expect(fresh.statusCode).toBe(204);
  });
});
