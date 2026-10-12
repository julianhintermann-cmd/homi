import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HouseholdRoleSchema, SESSION_COOKIE_NAME } from '@homi/shared';
import { z } from 'zod';
import { createSessionService } from '../../src/lib/sessions';
import { hashToken } from '../../src/lib/tokens';
import { requireMember, requireUser } from '../../src/plugins/auth';
import { buildTestApp, type TestApp } from '../helpers/app';
import { TEST_SESSION_SECRET } from '../helpers/config';
import { addMember, createHousehold, createLoggedInUser, createUser } from '../helpers/fixtures';

const DAY = 24 * 60 * 60 * 1000;

describe('session service', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await buildTestApp();
  });
  afterAll(() => t.close());

  it('stores only the HMAC of the token', async () => {
    const user = await createUser(t.prisma);
    const { token, session } = await t.app.sessions.create(user.id, { userAgent: 'x'.repeat(400) });
    const row = await t.prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(row.tokenHash).toBe(hashToken(TEST_SESSION_SECRET, token));
    expect(row.tokenHash).not.toContain(token);
    expect(row.userAgent).toHaveLength(255);
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(t.config.sessionTtlMs);
  });

  it('validates, slides the expiry at most every 15 minutes and expires', async () => {
    const user = await createUser(t.prisma, { displayName: 'Anna' });
    let now = new Date('2026-10-01T08:00:00Z');
    const sessions = createSessionService(t.prisma, { secret: TEST_SESSION_SECRET, ttlMs: 30 * DAY, now: () => now });
    const { token } = await sessions.create(user.id);

    now = new Date('2026-10-01T08:10:00Z');
    const fresh = await sessions.validate(token);
    expect(fresh).toMatchObject({ refreshed: false, user: { id: user.id, displayName: 'Anna', email: user.email } });

    now = new Date('2026-10-01T08:20:00Z');
    const refreshed = await sessions.validate(token);
    expect(refreshed?.refreshed).toBe(true);
    expect(refreshed?.session.expiresAt.toISOString()).toBe(new Date(now.getTime() + 30 * DAY).toISOString());

    now = new Date(now.getTime() + 31 * DAY);
    expect(await sessions.validate(token)).toBeNull();
    expect(await t.prisma.session.count({ where: { userId: user.id } })).toBe(0); // expired row deleted
  });

  it('rejects unknown and malformed tokens', async () => {
    expect(await t.app.sessions.validate('A'.repeat(43))).toBeNull();
    expect(await t.app.sessions.validate('../../etc')).toBeNull();
  });

  it('destroys one, all or all-but-one sessions', async () => {
    const user = await createUser(t.prisma);
    const a = await t.app.sessions.create(user.id);
    const b = await t.app.sessions.create(user.id);
    const c = await t.app.sessions.create(user.id);

    await t.app.sessions.destroy(a.token);
    expect(await t.app.sessions.validate(a.token)).toBeNull();

    expect(await t.app.sessions.destroyAllForUser(user.id, { exceptSessionId: b.session.id })).toBe(1);
    expect(await t.app.sessions.validate(b.token)).not.toBeNull();
    expect(await t.app.sessions.validate(c.token)).toBeNull();

    expect(await t.app.sessions.destroyAllForUser(user.id)).toBe(1);
  });
});

describe('auth hook, guards and error mapping', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await buildTestApp({
      configure: (app) => {
        app.get('/api/__whoami', async (request) => ({ userId: requireUser(request).id }));
        app.get<{ Params: { householdId: string }; Querystring: { minRole?: string } }>(
          '/api/__member/:householdId',
          async (request) => {
            const minRole = HouseholdRoleSchema.optional().parse(request.query.minRole);
            const membership = await requireMember(request, request.params.householdId, minRole);
            return { role: membership.role, householdId: membership.householdId };
          },
        );
        app.post('/api/__users', async (request) => {
          const body = z.object({ email: z.string() }).parse(request.body);
          return app.prisma.user.create({
            data: { email: body.email, displayName: 'Dup', passwordHash: 'x' },
            select: { id: true },
          });
        });
        app.delete('/api/__users/:id', async (request) => {
          const { id } = request.params as { id: string };
          await app.prisma.user.delete({ where: { id } });
          return { ok: true };
        });
      },
    });
  });
  afterAll(() => t.close());

  it('requireUser → 401 without a valid session and clears stale cookies', async () => {
    const anonymous = await t.client().get('/api/__whoami');
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Bitte melde dich an.' } });

    const stale = t.client().setCookie(SESSION_COOKIE_NAME, 'B'.repeat(43));
    const response = await stale.get('/api/__whoami');
    expect(response.statusCode).toBe(401);
    expect(response.headers['set-cookie']).toEqual(expect.stringContaining(`${SESSION_COOKIE_NAME}=;`));
    expect(stale.sessionToken).toBeUndefined();
  });

  it('resolves request.user from the cookie', async () => {
    const { user, client } = await createLoggedInUser(t.app);
    const response = await client.get('/api/__whoami');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ userId: user.id });
  });

  it('re-issues the cookie with HttpOnly/SameSite=Lax/Max-Age when the session slides', async () => {
    const { client, sessionId } = await createLoggedInUser(t.app);
    await t.prisma.session.update({
      where: { id: sessionId },
      data: { lastSeenAt: new Date(Date.now() - 20 * 60 * 1000) },
    });
    const response = await client.get('/api/__whoami');
    const cookie = String(response.headers['set-cookie']);
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain(`Max-Age=${30 * 24 * 60 * 60}`);
    expect(cookie).not.toContain('Secure'); // only in production
  });

  it('requireMember → 404 for non-members, 403 for insufficient roles', async () => {
    const owner = await createLoggedInUser(t.app);
    const member = await createLoggedInUser(t.app);
    const stranger = await createLoggedInUser(t.app);
    const household = await createHousehold(t.prisma, owner.user.id, 'WG Bern');
    await addMember(t.prisma, household, member.user.id, 'MEMBER');

    const url = `/api/__member/${household.id}`;
    expect((await owner.client.get(url, { query: { minRole: 'OWNER' } })).json()).toEqual({
      role: 'OWNER',
      householdId: household.id,
    });
    expect((await member.client.get(url)).statusCode).toBe(200);

    const forbidden = await member.client.get(url, { query: { minRole: 'ADMIN' } });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });

    const hidden = await stranger.client.get(url);
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });

    expect((await owner.client.get('/api/__member/not-a-uuid')).statusCode).toBe(404);
    expect((await t.client().get(url)).statusCode).toBe(401);
  });

  it('maps Prisma unique violations to 409 and missing records to 404', async () => {
    const { client } = await createLoggedInUser(t.app);
    expect((await client.post('/api/__users', { email: 'dup@example.ch' })).statusCode).toBe(200);
    const duplicate = await client.post('/api/__users', { email: 'dup@example.ch' });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ error: { code: 'CONFLICT', message: 'Das ist bereits vorhanden.' } });

    const missing = await client.delete('/api/__users/0f8fad5b-d9cb-469f-a165-70867728950e');
    expect(missing.statusCode).toBe(404);
    expect(missing.body).not.toMatch(/prisma/i);
  });
});
