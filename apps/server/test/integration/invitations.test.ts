import { Writable } from 'node:stream';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AcceptInvitationResponseSchema,
  CreatedInvitationSchema,
  InvitationListResponseSchema,
  InvitationPreviewSchema,
} from '@homi/shared';
import { hashToken } from '../../src/lib/tokens';
import { buildLoggerOptions, sanitizeUrl } from '../../src/logger';
import { HOUSEHOLD_RATE_LIMITS } from '../../src/modules/households/routes';
import { MAX_ACTIVE_INVITATIONS } from '../../src/modules/households/service';
import { buildTestApp, type TestApp } from '../helpers/app';
import { createTestConfig, TEST_APP_URL, TEST_SESSION_SECRET } from '../helpers/config';
import { addMember, createHousehold, createLoggedInUser } from '../helpers/fixtures';
import type { TestClient } from '../helpers/http';

const DAY_MS = 24 * 60 * 60 * 1000;
const URL_PATTERN = new RegExp(
  `^${TEST_APP_URL.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/einladung/([A-Za-z0-9_-]{43})$`,
);

function tokenOf(url: string): string {
  const match = URL_PATTERN.exec(url);
  if (!match?.[1]) throw new Error(`unexpected invitation url ${url}`);
  return match[1];
}

describe('invitations', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await buildTestApp();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(() => t.close());

  async function setup() {
    const owner = await createLoggedInUser(t.app, { displayName: 'Julian' });
    const household = await createHousehold(t.prisma, owner.user.id, 'Unser Zuhause');
    return { owner, household };
  }

  async function invite(client: TestClient, householdId: string, body: Record<string, unknown> = {}) {
    const res = await client.post(`/api/households/${householdId}/invitations`, body);
    expect(res.statusCode).toBe(201);
    const created = CreatedInvitationSchema.parse(res.json());
    return { ...created, token: tokenOf(created.url) };
  }

  describe('create / list / revoke', () => {
    it('returns the raw token only once in the URL and stores only its HMAC', async () => {
      const { owner, household } = await setup();
      const before = Date.now();
      const created = await invite(owner.client, household.id);
      expect(created.role).toBe('MEMBER');
      const expiresIn = new Date(created.expiresAt).getTime() - before;
      expect(expiresIn).toBeGreaterThan(7 * DAY_MS - 60_000);
      expect(expiresIn).toBeLessThan(7 * DAY_MS + 60_000);

      const row = await t.prisma.householdInvitation.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.tokenHash).toBe(hashToken(TEST_SESSION_SECRET, created.token));
      expect(JSON.stringify(row)).not.toContain(created.token);
      expect(row.createdById).toBe(owner.user.id);

      const list = await owner.client.get(`/api/households/${household.id}/invitations`);
      expect(list.body).not.toContain(created.token);
      expect(InvitationListResponseSchema.parse(list.json())).toEqual([
        {
          id: created.id,
          role: 'MEMBER',
          createdAt: row.createdAt.toISOString(),
          expiresAt: created.expiresAt,
          createdBy: { id: owner.user.id, displayName: 'Julian' },
        },
      ]);
    });

    it('validates role and validity', async () => {
      const { owner, household } = await setup();
      const url = `/api/households/${household.id}/invitations`;
      expect((await owner.client.post(url, { role: 'OWNER' })).statusCode).toBe(400);
      expect((await owner.client.post(url, { expiresInDays: 0 })).statusCode).toBe(400);
      expect((await owner.client.post(url, { expiresInDays: 31 })).statusCode).toBe(400);
      expect((await owner.client.post(url, { expiresInDays: 2.5 })).statusCode).toBe(400);
      const admin = await invite(owner.client, household.id, { role: 'ADMIN', expiresInDays: 30 });
      expect(admin.role).toBe('ADMIN');
      expect(new Date(admin.expiresAt).getTime() - Date.now()).toBeGreaterThan(29 * DAY_MS);
    });

    it('lists only active invitations and revokes idempotently', async () => {
      const { owner, household } = await setup();
      const active = await invite(owner.client, household.id);
      const revoked = await invite(owner.client, household.id);
      const expired = await invite(owner.client, household.id);
      await t.prisma.householdInvitation.update({
        where: { id: expired.id },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });

      const url = (id: string) => `/api/households/${household.id}/invitations/${id}`;
      expect((await owner.client.delete(url(revoked.id))).statusCode).toBe(204);
      expect((await owner.client.delete(url(revoked.id))).statusCode).toBe(204);
      expect((await owner.client.delete(url('7c9e6679-7425-40de-944b-e07fc1f90ae7'))).statusCode).toBe(404);
      expect((await owner.client.delete(url('nope'))).statusCode).toBe(404);

      const list = InvitationListResponseSchema.parse(
        (await owner.client.get(`/api/households/${household.id}/invitations`)).json(),
      );
      expect(list.map((i) => i.id)).toEqual([active.id]);
    });

    // Regression (review): revoke used to answer 204 while a concurrent accept consumed the link.
    it('never reports "revoked" for an invitation a concurrent accept consumed', async () => {
      const { owner, household } = await setup();
      for (let run = 0; run < 15; run++) {
        const created = await invite(owner.client, household.id);
        const joiner = await createLoggedInUser(t.app);
        const [accept, revoke] = await Promise.all([
          joiner.client.post(`/api/invitations/${created.token}/accept`),
          owner.client.delete(`/api/households/${household.id}/invitations/${created.id}`),
        ]);
        const row = await t.prisma.householdInvitation.findUniqueOrThrow({ where: { id: created.id } });
        const joined = await t.prisma.householdMember.count({
          where: { householdId: household.id, userId: joiner.user.id },
        });
        if (accept.statusCode === 200) {
          expect(revoke.statusCode).toBe(409);
          expect(row.acceptedAt).toBeInstanceOf(Date);
          expect(row.revokedAt).toBeNull();
          expect(joined).toBe(1);
        } else {
          expect(accept.statusCode).toBe(410);
          expect(revoke.statusCode).toBe(204);
          expect(row.revokedAt).toBeInstanceOf(Date);
          expect(row.acceptedAt).toBeNull();
          expect(joined).toBe(0);
        }
      }
    });

    it('caps the number of active invitations per household', async () => {
      const { owner, household } = await setup();
      await t.prisma.householdInvitation.createMany({
        data: Array.from({ length: MAX_ACTIVE_INVITATIONS }, (_, index) => ({
          householdId: household.id,
          tokenHash: hashToken(TEST_SESSION_SECRET, `cap-${household.id}-${index}`),
          createdById: owner.user.id,
          expiresAt: new Date(Date.now() + DAY_MS),
        })),
      });
      const res = await owner.client.post(`/api/households/${household.id}/invitations`, {});
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('CONFLICT');
      // Revoking one makes room again.
      const one = await t.prisma.householdInvitation.findFirstOrThrow({ where: { householdId: household.id } });
      await owner.client.delete(`/api/households/${household.id}/invitations/${one.id}`);
      await invite(owner.client, household.id);
    });

    it('rate-limits invitation and household creation per user', async () => {
      const limited = await buildTestApp({ rateLimit: true });
      try {
        const owner = await createLoggedInUser(limited.app);
        const household = await createHousehold(limited.prisma, owner.user.id, 'Limitiert');
        const { max: inviteMax } = HOUSEHOLD_RATE_LIMITS.createInvitation;
        const url = `/api/households/${household.id}/invitations`;
        for (let i = 0; i < inviteMax; i++) expect((await owner.client.post(url, {})).statusCode).toBe(201);
        const limitedInvite = await owner.client.post(url, {});
        expect(limitedInvite.statusCode).toBe(429);
        expect(limitedInvite.json().error.code).toBe('RATE_LIMITED');
        expect(Number(limitedInvite.headers['retry-after'])).toBeGreaterThan(0);

        const { max: householdMax } = HOUSEHOLD_RATE_LIMITS.createHousehold;
        for (let i = 0; i < householdMax; i++) {
          expect((await owner.client.post('/api/households', { name: `Haushalt ${i}` })).statusCode).toBe(201);
        }
        expect((await owner.client.post('/api/households', { name: 'Zu viel' })).statusCode).toBe(429);
        // Per user: somebody else is not affected.
        const other = await createLoggedInUser(limited.app);
        expect((await other.client.post('/api/households', { name: 'Meins' })).statusCode).toBe(201);
      } finally {
        await limited.close();
      }
    });

    it('cannot revoke an invitation of another household or an accepted one', async () => {
      const a = await setup();
      const b = await setup();
      const foreign = await invite(b.owner.client, b.household.id);
      expect(
        (await a.owner.client.delete(`/api/households/${a.household.id}/invitations/${foreign.id}`)).statusCode,
      ).toBe(404);
      expect(
        (await t.prisma.householdInvitation.findUniqueOrThrow({ where: { id: foreign.id } })).revokedAt,
      ).toBeNull();

      const joiner = await createLoggedInUser(t.app);
      expect((await joiner.client.post(`/api/invitations/${foreign.token}/accept`)).statusCode).toBe(200);
      const res = await b.owner.client.delete(`/api/households/${b.household.id}/invitations/${foreign.id}`);
      expect(res.statusCode).toBe(409);
    });
  });

  describe('public preview', () => {
    it('shows household, inviter, role, expiry and status without member data or a session', async () => {
      const { owner, household } = await setup();
      const created = await invite(owner.client, household.id, { role: 'ADMIN' });
      const res = await t.client().get(`/api/invitations/${created.token}`);
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const preview = InvitationPreviewSchema.parse(res.json());
      expect(Object.keys(res.json()).sort()).toEqual(['expiresAt', 'householdName', 'inviterName', 'role', 'status']);
      expect(preview).toEqual({
        householdName: 'Unser Zuhause',
        inviterName: 'Julian',
        role: 'ADMIN',
        expiresAt: created.expiresAt,
        status: 'valid',
      });
    });

    // Regression (review r3, S6): a used link kept disclosing the household's live name and the
    // inviter to anybody who ever saw it – e.g. a member who was removed afterwards.
    it('stops disclosing household and inviter names once the link is no longer valid', async () => {
      const { owner, household } = await setup();
      const created = await invite(owner.client, household.id);
      const joiner = await createLoggedInUser(t.app, { displayName: 'Mia' });
      expect((await joiner.client.post(`/api/invitations/${created.token}/accept`)).statusCode).toBe(200);
      expect((await owner.client.delete(`/api/households/${household.id}/members/${joiner.user.id}`)).statusCode).toBe(
        204,
      );
      expect(
        (await owner.client.patch(`/api/households/${household.id}`, { name: 'Umbenannt nach Rauswurf' })).statusCode,
      ).toBe(200);

      for (const client of [t.client(), joiner.client]) {
        const res = await client.get(`/api/invitations/${created.token}`);
        expect(res.statusCode).toBe(200);
        expect(res.body).not.toContain('Umbenannt');
        expect(res.body).not.toContain('Julian');
        expect(InvitationPreviewSchema.parse(res.json())).toEqual({
          householdName: null,
          inviterName: null,
          role: 'MEMBER',
          expiresAt: created.expiresAt,
          status: 'used',
        });
      }
    });

    it('answers unknown and malformed tokens identically with 404', async () => {
      const unknown = await t.client().get(`/api/invitations/${'A'.repeat(43)}`);
      const malformed = await t.client().get('/api/invitations/abc');
      expect(unknown.statusCode).toBe(404);
      expect(malformed.statusCode).toBe(404);
      expect(unknown.json()).toEqual(malformed.json());
      expect(unknown.json().error.code).toBe('NOT_FOUND');
    });

    // Regression (review): the web app links to `/login?redirect=/einladung/<token>` with the path
    // NOT percent-encoded, so a full page load of that URL is redacted by the request logger.
    it('keeps the token out of request logs for the sign-in redirect form the web app uses', async () => {
      const { owner, household } = await setup();
      const { token } = await invite(owner.client, household.id);
      for (const page of ['/login', '/registrieren']) {
        const logged = sanitizeUrl(`${page}?redirect=/einladung/${token}`);
        expect(logged).not.toContain(token);
        expect(logged).toBe(`${page}?redirect=/einladung/[redacted]`);
      }
      expect(sanitizeUrl(`/api/invitations/${token}/accept`)).not.toContain(token);
    });

    // Regression (review r3): the auth pages re-encode the target (`withRedirect()` →
    // `/registrieren?redirect=%2Feinladung%2F<token>`); a full page load of such a URL logged the raw
    // token because only a literal `/einladung/` was redacted.
    it('keeps the token out of the request log for percent-encoded redirect targets', async () => {
      const lines: string[] = [];
      const config = createTestConfig({ LOG_LEVEL: 'info', NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40) });
      const stream = new Writable({
        write(chunk: Buffer, _encoding, callback) {
          lines.push(String(chunk));
          callback();
        },
      });
      // The production logger options (serializers, redaction) writing into `lines`.
      const production = buildLoggerOptions(config) as Record<string, unknown>;
      const logged = await buildTestApp({ logger: { ...production, stream } as never });
      try {
        const { owner, household } = await setup();
        const { token } = await invite(owner.client, household.id);
        const once = encodeURIComponent(`/einladung/${token}`);
        const urls = [
          `/login?redirect=/einladung/${token}`,
          `/registrieren?redirect=${once}`,
          `/passwort-vergessen?redirect=${once}`,
          `/login?redirect=${once.replace(/%2F/g, '%2f')}&x=1`,
          `/login?redirect=${encodeURIComponent(`/registrieren?redirect=${once}`)}`,
          `/EINLADUNG/${token}`,
        ];
        for (const url of urls) {
          lines.length = 0;
          await logged.client().get(url);
          const requestLines = lines.filter((line) => line.includes('"url"'));
          expect(requestLines.length, url).toBeGreaterThan(0);
          expect(
            lines.filter((line) => line.includes(token)),
            url,
          ).toEqual([]);
          expect(requestLines.join('\n')).toContain('[redacted]');
        }
        expect(sanitizeUrl(`/registrieren?redirect=${once}&next=1`)).toBe(
          '/registrieren?redirect=%2Feinladung%2F[redacted]&next=1',
        );
        expect(sanitizeUrl('/api/households/1/items?redirect=%2Finventar')).toBe(
          '/api/households/1/items?redirect=%2Finventar',
        );
      } finally {
        await logged.close();
      }
    });

    it('is rate limited per IP', async () => {
      const limited = await buildTestApp({ rateLimit: true });
      try {
        const client = limited.client();
        const statuses: number[] = [];
        for (let i = 0; i < 31; i++) statuses.push((await client.get(`/api/invitations/${'B'.repeat(43)}`)).statusCode);
        expect(statuses.slice(0, 30).every((s) => s === 404)).toBe(true);
        expect(statuses[30]).toBe(429);
      } finally {
        await limited.close();
      }
    });
  });

  describe('accept', () => {
    it('joins the household + conversation, consumes the invitation and makes the household active', async () => {
      const { owner, household } = await setup();
      const created = await invite(owner.client, household.id, { role: 'ADMIN' });
      const joiner = await createLoggedInUser(t.app, { displayName: 'Lisa' });
      const emitToUsers = vi.spyOn(t.app.realtime, 'emitToUsers');
      const emitSync = vi.spyOn(t.app.realtime, 'emitSync');
      const syncUserRooms = vi.spyOn(t.app.realtime, 'syncUserRooms');

      const res = await joiner.client.post(`/api/invitations/${created.token}/accept`);
      expect(res.statusCode).toBe(200);
      expect(AcceptInvitationResponseSchema.parse(res.json())).toEqual({ householdId: household.id });

      const membership = await t.prisma.householdMember.findUniqueOrThrow({
        where: { householdId_userId: { householdId: household.id, userId: joiner.user.id } },
      });
      expect(membership.role).toBe('ADMIN');
      expect(
        await t.prisma.conversationMember.count({
          where: { userId: joiner.user.id, conversationId: household.conversationId },
        }),
      ).toBe(1);
      const row = await t.prisma.householdInvitation.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.acceptedById).toBe(joiner.user.id);
      expect(row.acceptedAt).toBeInstanceOf(Date);
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: joiner.user.id } })).lastHouseholdId).toBe(
        household.id,
      );
      const activity = await t.prisma.householdActivity.findFirstOrThrow({
        where: { householdId: household.id, type: 'MEMBER_JOINED' },
      });
      expect(activity).toMatchObject({ actorId: joiner.user.id, entityId: joiner.user.id });
      expect(activity.meta).toMatchObject({ displayName: 'Lisa', role: 'ADMIN' });

      expect(syncUserRooms).toHaveBeenCalledWith(joiner.user.id);
      expect(emitToUsers).toHaveBeenCalledWith([joiner.user.id], 'membership', {
        householdId: household.id,
        action: 'added',
      });
      expect(emitSync).toHaveBeenCalledWith(
        expect.objectContaining({ householdId: household.id, scope: 'members', action: 'created' }),
      );

      const preview = InvitationPreviewSchema.parse((await t.client().get(`/api/invitations/${created.token}`)).json());
      expect(preview).toMatchObject({ status: 'used', householdName: null, inviterName: null });
    });

    it('is single use: a second user gets 410, the same user just gets the household id again', async () => {
      const { owner, household } = await setup();
      const created = await invite(owner.client, household.id);
      const first = await createLoggedInUser(t.app);
      const second = await createLoggedInUser(t.app);

      expect((await first.client.post(`/api/invitations/${created.token}/accept`)).statusCode).toBe(200);
      const again = await first.client.post(`/api/invitations/${created.token}/accept`);
      expect(again.statusCode).toBe(200);
      expect(again.json()).toEqual({ householdId: household.id });

      const reuse = await second.client.post(`/api/invitations/${created.token}/accept`);
      expect(reuse.statusCode).toBe(410);
      expect(reuse.json().error).toMatchObject({ code: 'INVITATION_INVALID', details: { status: 'used' } });
      expect(await t.prisma.householdMember.count({ where: { householdId: household.id } })).toBe(2);
    });

    it('lets exactly one of two concurrent users consume an invitation', async () => {
      const { owner, household } = await setup();
      const created = await invite(owner.client, household.id);
      const [a, b] = await Promise.all([createLoggedInUser(t.app), createLoggedInUser(t.app)]);
      const results = await Promise.all([
        a.client.post(`/api/invitations/${created.token}/accept`),
        b.client.post(`/api/invitations/${created.token}/accept`),
      ]);
      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 410]);
      expect(await t.prisma.householdMember.count({ where: { householdId: household.id } })).toBe(2);
    });

    it('does not consume an invitation when the user is already a member, but makes it active', async () => {
      const { owner, household } = await setup();
      const member = await createLoggedInUser(t.app);
      await addMember(t.prisma, household, member.user.id, 'MEMBER');
      // Regression (review): the member's active household is another one – after accepting the
      // link the invited household must be the active one on the server too (not only in the client).
      const other = await createHousehold(t.prisma, member.user.id, 'Atelier');
      await t.prisma.user.update({ where: { id: member.user.id }, data: { lastHouseholdId: other.id } });
      const created = await invite(owner.client, household.id, { role: 'ADMIN' });

      const res = await member.client.post(`/api/invitations/${created.token}/accept`);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ householdId: household.id });
      const me = await member.client.get('/api/auth/me');
      expect(me.statusCode).toBe(200);
      expect(me.json().activeHouseholdId).toBe(household.id);
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: member.user.id } })).lastHouseholdId).toBe(
        household.id,
      );
      const row = await t.prisma.householdInvitation.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.acceptedAt).toBeNull();
      expect(
        (
          await t.prisma.householdMember.findUniqueOrThrow({
            where: { householdId_userId: { householdId: household.id, userId: member.user.id } },
          })
        ).role,
      ).toBe('MEMBER');
    });

    it('rejects expired and revoked invitations with 410 and the reason', async () => {
      const { owner, household } = await setup();
      const expired = await invite(owner.client, household.id);
      await t.prisma.householdInvitation.update({
        where: { id: expired.id },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });
      const revoked = await invite(owner.client, household.id);
      await owner.client.delete(`/api/households/${household.id}/invitations/${revoked.id}`);
      const joiner = await createLoggedInUser(t.app);

      for (const [created, status] of [
        [expired, 'expired'],
        [revoked, 'revoked'],
      ] as const) {
        const preview = InvitationPreviewSchema.parse(
          (await t.client().get(`/api/invitations/${created.token}`)).json(),
        );
        expect(preview).toMatchObject({ status, householdName: null, inviterName: null });
        const res = await joiner.client.post(`/api/invitations/${created.token}/accept`);
        expect(res.statusCode).toBe(410);
        expect(res.json().error).toMatchObject({ code: 'INVITATION_INVALID', details: { status } });
      }
      expect(await t.prisma.householdMember.count({ where: { householdId: household.id } })).toBe(1);
    });

    it('requires a session, the CSRF header and a known token', async () => {
      const { owner, household } = await setup();
      const created = await invite(owner.client, household.id);
      expect((await t.client().post(`/api/invitations/${created.token}/accept`)).statusCode).toBe(401);
      const joiner = await createLoggedInUser(t.app);
      expect(
        (await joiner.client.post(`/api/invitations/${created.token}/accept`, undefined, { csrf: false })).statusCode,
      ).toBe(403);
      expect((await joiner.client.post(`/api/invitations/${'C'.repeat(43)}/accept`)).statusCode).toBe(404);
      expect((await joiner.client.post('/api/invitations/short/accept')).statusCode).toBe(404);
      expect(await t.prisma.householdMember.count({ where: { householdId: household.id } })).toBe(1);
    });
  });
});
