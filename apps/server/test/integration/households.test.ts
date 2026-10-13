import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import {
  DEFAULT_SHOPPING_LIST_NAME,
  HouseholdDetailSchema,
  HouseholdListResponseSchema,
  MemberDtoSchema,
  SOCKET_PATH,
  type ClientToServerEvents,
  type HouseholdRole,
  type MembershipEvent,
  type ServerToClientEvents,
} from '@homi/shared';
import { DELETE_HOUSEHOLD_ATTEMPTS } from '../../src/modules/households/service';
import { householdRoom } from '../../src/plugins/realtime';
import { buildTestApp, type TestApp } from '../helpers/app';
import { TEST_APP_URL } from '../helpers/config';
import { addMember, createHousehold, createLoggedInUser, type TestHousehold } from '../helpers/fixtures';
import type { TestClient } from '../helpers/http';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const UNKNOWN_ID = '3f0c6c1e-0000-4000-8000-000000000000';

describe('households', () => {
  let t: TestApp;
  let baseUrl: string;
  const sockets: ClientSocket[] = [];

  beforeAll(async () => {
    t = await buildTestApp();
    baseUrl = await t.app.listen({ port: 0, host: '127.0.0.1' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const socket of sockets.splice(0)) socket.disconnect();
  });

  afterAll(() => t.close());

  /** Household with an OWNER plus one logged-in user per extra role. */
  async function householdWith(roles: HouseholdRole[] = []) {
    const owner = await createLoggedInUser(t.app, { displayName: 'Julian' });
    const household = await createHousehold(t.prisma, owner.user.id, 'Unser Zuhause');
    const others: Array<Awaited<ReturnType<typeof createLoggedInUser>> & { role: HouseholdRole }> = [];
    for (const [index, role] of roles.entries()) {
      const member = await createLoggedInUser(t.app, { displayName: `Person ${index + 1}` });
      await addMember(t.prisma, household, member.user.id, role);
      others.push({ ...member, role });
    }
    return { owner, household, others };
  }

  describe('POST /api/households', () => {
    it('creates household, OWNER membership, shopping list, conversation and activity in one go', async () => {
      const { user, client } = await createLoggedInUser(t.app, { displayName: 'Julian' });
      const emitToUsers = vi.spyOn(t.app.realtime, 'emitToUsers');
      const syncUserRooms = vi.spyOn(t.app.realtime, 'syncUserRooms');

      const res = await client.post('/api/households', { name: '  Unser Zuhause  ' });
      expect(res.statusCode).toBe(201);
      const detail = HouseholdDetailSchema.parse(res.json());
      expect(detail).toMatchObject({
        name: 'Unser Zuhause',
        myRole: 'OWNER',
        stats: { itemCount: 0 },
        members: [{ userId: user.id, displayName: 'Julian', role: 'OWNER' }],
      });

      const hid = detail.id;
      const [lists, conversations, activities, dbUser] = await Promise.all([
        t.prisma.shoppingList.findMany({ where: { householdId: hid } }),
        t.prisma.conversation.findMany({ where: { householdId: hid }, include: { members: true } }),
        t.prisma.householdActivity.findMany({ where: { householdId: hid } }),
        t.prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
      ]);
      expect(lists.map((l) => l.name)).toEqual([DEFAULT_SHOPPING_LIST_NAME]);
      expect(conversations).toHaveLength(1);
      expect(conversations[0]?.type).toBe('HOUSEHOLD');
      expect(conversations[0]?.members.map((m) => m.userId)).toEqual([user.id]);
      expect(activities.map((a) => [a.type, a.actorId, a.entityId])).toEqual([['HOUSEHOLD_CREATED', user.id, hid]]);
      expect(dbUser.lastHouseholdId).toBe(hid);

      expect(syncUserRooms).toHaveBeenCalledWith(user.id);
      expect(emitToUsers).toHaveBeenCalledWith([user.id], 'membership', { householdId: hid, action: 'added' });
    });

    it('validates the name and requires a session + CSRF header', async () => {
      const { client } = await createLoggedInUser(t.app);
      const empty = await client.post('/api/households', { name: '   ' });
      expect(empty.statusCode).toBe(400);
      expect(empty.json().error.code).toBe('VALIDATION');
      expect(empty.json().error.details.fieldErrors.name).toBeTruthy();

      const tooLong = await client.post('/api/households', { name: 'x'.repeat(61) });
      expect(tooLong.statusCode).toBe(400);

      const noCsrf = await client.post('/api/households', { name: 'WG' }, { csrf: false });
      expect(noCsrf.statusCode).toBe(403);
      expect(noCsrf.json().error.code).toBe('CSRF');

      const anonymous = await t.client().post('/api/households', { name: 'WG' });
      expect(anonymous.statusCode).toBe(401);
      expect(await t.prisma.household.count({ where: { name: 'WG' } })).toBe(0);
    });
  });

  describe('GET /api/households and /api/households/:id', () => {
    it('lists only the memberships of the current user with role and member count', async () => {
      const { owner, household, others } = await householdWith(['MEMBER', 'ADMIN']);
      const second = await createHousehold(t.prisma, owner.user.id, 'Ferienhaus');
      const foreign = await createLoggedInUser(t.app);
      await createHousehold(t.prisma, foreign.user.id, 'Fremd');

      const res = await owner.client.get('/api/households');
      expect(res.statusCode).toBe(200);
      const list = HouseholdListResponseSchema.parse(res.json());
      expect(list).toEqual([
        { id: household.id, name: 'Unser Zuhause', role: 'OWNER', memberCount: 3 },
        { id: second.id, name: 'Ferienhaus', role: 'OWNER', memberCount: 1 },
      ]);

      const asAdmin = HouseholdListResponseSchema.parse((await others[1]!.client.get('/api/households')).json());
      expect(asAdmin).toEqual([{ id: household.id, name: 'Unser Zuhause', role: 'ADMIN', memberCount: 3 }]);
    });

    it('returns the detail with members, myRole and the item count', async () => {
      const { owner, household, others } = await householdWith(['MEMBER']);
      await t.prisma.inventoryItem.createMany({
        data: [
          { householdId: household.id, name: 'Milch' },
          { householdId: household.id, name: 'Kaffee' },
        ],
      });

      const res = await others[0]!.client.get(`/api/households/${household.id}`);
      expect(res.statusCode).toBe(200);
      const detail = HouseholdDetailSchema.parse(res.json());
      expect(detail.myRole).toBe('MEMBER');
      expect(detail.stats.itemCount).toBe(2);
      expect(detail.members.map((m) => [m.userId, m.role])).toEqual([
        [owner.user.id, 'OWNER'],
        [others[0]!.user.id, 'MEMBER'],
      ]);
    });
  });

  describe('tenant isolation', () => {
    it('answers 404 to non-members on every household route (and for malformed ids)', async () => {
      const { household, others } = await householdWith(['MEMBER']);
      const invitation = await t.prisma.householdInvitation.create({
        data: {
          householdId: household.id,
          tokenHash: 'a'.repeat(64),
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      const outsider = await createLoggedInUser(t.app);
      await createHousehold(t.prisma, outsider.user.id, 'Eigener Haushalt');
      const hid = household.id;
      const memberId = others[0]!.user.id;

      const attempts: Array<[string, (c: TestClient) => ReturnType<TestClient['get']>]> = [
        ['GET detail', (c) => c.get(`/api/households/${hid}`)],
        ['PATCH household', (c) => c.patch(`/api/households/${hid}`, { name: 'Gekapert' })],
        ['DELETE household', (c) => c.delete(`/api/households/${hid}`)],
        ['PATCH member', (c) => c.patch(`/api/households/${hid}/members/${memberId}`, { role: 'ADMIN' })],
        ['DELETE member', (c) => c.delete(`/api/households/${hid}/members/${memberId}`)],
        ['GET invitations', (c) => c.get(`/api/households/${hid}/invitations`)],
        ['POST invitation', (c) => c.post(`/api/households/${hid}/invitations`, {})],
        ['DELETE invitation', (c) => c.delete(`/api/households/${hid}/invitations/${invitation.id}`)],
        ['GET dashboard', (c) => c.get(`/api/households/${hid}/dashboard`)],
      ];
      for (const [label, attempt] of attempts) {
        const res = await attempt(outsider.client);
        expect({ label, status: res.statusCode, code: res.json().error?.code }).toEqual({
          label,
          status: 404,
          code: 'NOT_FOUND',
        });
      }

      for (const url of ['/api/households/not-a-uuid', `/api/households/${UNKNOWN_ID}`]) {
        expect((await outsider.client.get(url)).statusCode).toBe(404);
      }
      // Nothing changed.
      expect((await t.prisma.household.findUniqueOrThrow({ where: { id: hid } })).name).toBe('Unser Zuhause');
      expect(await t.prisma.householdMember.count({ where: { householdId: hid } })).toBe(2);
      expect(
        (await t.prisma.householdInvitation.findUniqueOrThrow({ where: { id: invitation.id } })).revokedAt,
      ).toBeNull();
    });

    it('does not touch members of another household through a valid member id', async () => {
      const a = await householdWith([]);
      const b = await householdWith(['MEMBER']);
      const foreignMember = b.others[0]!.user.id;
      const remove = await a.owner.client.delete(`/api/households/${a.household.id}/members/${foreignMember}`);
      expect(remove.statusCode).toBe(404);
      const role = await a.owner.client.patch(`/api/households/${a.household.id}/members/${foreignMember}`, {
        role: 'ADMIN',
      });
      expect(role.statusCode).toBe(404);
      expect(
        await t.prisma.householdMember.findUnique({
          where: { householdId_userId: { householdId: b.household.id, userId: foreignMember } },
        }),
      ).toMatchObject({ role: 'MEMBER' });
    });
  });

  describe('permission matrix', () => {
    it('MEMBER: read + leave only', async () => {
      const { owner, household, others } = await householdWith(['MEMBER', 'MEMBER']);
      const [member, otherMember] = others as [(typeof others)[0], (typeof others)[0]];
      const hid = household.id;

      expect((await member.client.get(`/api/households/${hid}`)).statusCode).toBe(200);
      expect((await member.client.patch(`/api/households/${hid}`, { name: 'Neu' })).statusCode).toBe(403);
      expect((await member.client.delete(`/api/households/${hid}`)).statusCode).toBe(403);
      expect((await member.client.get(`/api/households/${hid}/invitations`)).statusCode).toBe(403);
      expect((await member.client.post(`/api/households/${hid}/invitations`, {})).statusCode).toBe(403);
      expect(
        (await member.client.patch(`/api/households/${hid}/members/${otherMember.user.id}`, { role: 'ADMIN' }))
          .statusCode,
      ).toBe(403);
      expect(
        (await member.client.patch(`/api/households/${hid}/members/${member.user.id}`, { role: 'OWNER' })).statusCode,
      ).toBe(403);
      expect((await member.client.delete(`/api/households/${hid}/members/${otherMember.user.id}`)).statusCode).toBe(
        403,
      );
      expect((await member.client.delete(`/api/households/${hid}/members/${owner.user.id}`)).statusCode).toBe(403);
      expect(await t.prisma.householdMember.count({ where: { householdId: hid } })).toBe(3);
    });

    it('ADMIN: rename, invite and remove MEMBERs – but no role changes, no removing ADMIN/OWNER, no delete', async () => {
      const { owner, household, others } = await householdWith(['ADMIN', 'ADMIN', 'MEMBER']);
      const [admin, otherAdmin, member] = others as [(typeof others)[0], (typeof others)[0], (typeof others)[0]];
      const hid = household.id;

      const renamed = await admin.client.patch(`/api/households/${hid}`, { name: 'WG Basel' });
      expect(renamed.statusCode).toBe(200);
      expect(HouseholdDetailSchema.parse(renamed.json())).toMatchObject({ name: 'WG Basel', myRole: 'ADMIN' });

      expect((await admin.client.post(`/api/households/${hid}/invitations`, { role: 'ADMIN' })).statusCode).toBe(201);
      expect((await admin.client.get(`/api/households/${hid}/invitations`)).statusCode).toBe(200);
      expect(
        (await admin.client.patch(`/api/households/${hid}/members/${member.user.id}`, { role: 'ADMIN' })).statusCode,
      ).toBe(403);
      expect(
        (await admin.client.patch(`/api/households/${hid}/members/${admin.user.id}`, { role: 'OWNER' })).statusCode,
      ).toBe(403);
      expect((await admin.client.delete(`/api/households/${hid}/members/${otherAdmin.user.id}`)).statusCode).toBe(403);
      expect((await admin.client.delete(`/api/households/${hid}/members/${owner.user.id}`)).statusCode).toBe(403);
      expect((await admin.client.delete(`/api/households/${hid}`)).statusCode).toBe(403);

      expect((await admin.client.delete(`/api/households/${hid}/members/${member.user.id}`)).statusCode).toBe(204);
      expect(await t.prisma.householdMember.count({ where: { householdId: hid } })).toBe(3);
    });

    it('OWNER: change roles, remove ADMINs and delete', async () => {
      const { owner, household, others } = await householdWith(['ADMIN', 'MEMBER']);
      const [admin, member] = others as [(typeof others)[0], (typeof others)[0]];
      const hid = household.id;
      const emitSync = vi.spyOn(t.app.realtime, 'emitSync');

      const promoted = await owner.client.patch(`/api/households/${hid}/members/${member.user.id}`, {
        role: 'ADMIN',
      });
      expect(promoted.statusCode).toBe(200);
      expect(MemberDtoSchema.parse(promoted.json())).toMatchObject({ userId: member.user.id, role: 'ADMIN' });
      expect(emitSync).toHaveBeenCalledWith({
        householdId: hid,
        scope: 'members',
        action: 'updated',
        entityId: member.user.id,
        actorId: owner.user.id,
      });

      expect((await owner.client.delete(`/api/households/${hid}/members/${admin.user.id}`)).statusCode).toBe(204);
      expect(
        (await owner.client.patch(`/api/households/${hid}/members/${member.user.id}`, { role: 'SUPERUSER' }))
          .statusCode,
      ).toBe(400);
      expect((await owner.client.delete(`/api/households/${hid}`)).statusCode).toBe(204);
      expect(await t.prisma.household.findUnique({ where: { id: hid } })).toBeNull();
    });
  });

  describe('role rules', () => {
    it('never leaves a household without OWNER (409 LAST_OWNER)', async () => {
      const { owner, household, others } = await householdWith(['MEMBER']);
      const hid = household.id;
      const member = others[0]!;

      const demoteSelf = await owner.client.patch(`/api/households/${hid}/members/${owner.user.id}`, {
        role: 'ADMIN',
      });
      expect(demoteSelf.statusCode).toBe(409);
      expect(demoteSelf.json().error.code).toBe('LAST_OWNER');

      const leave = await owner.client.delete(`/api/households/${hid}/members/${owner.user.id}`);
      expect(leave.statusCode).toBe(409);
      expect(leave.json().error.code).toBe('LAST_OWNER');

      // A second OWNER makes stepping down possible.
      const promote = await owner.client.patch(`/api/households/${hid}/members/${member.user.id}`, { role: 'OWNER' });
      expect(MemberDtoSchema.parse(promote.json()).role).toBe('OWNER');
      const stepDown = await owner.client.patch(`/api/households/${hid}/members/${owner.user.id}`, { role: 'MEMBER' });
      expect(stepDown.statusCode).toBe(200);

      // Now the former owner is a MEMBER and the new owner is the last one.
      const lastOwnerDemote = await member.client.patch(`/api/households/${hid}/members/${member.user.id}`, {
        role: 'MEMBER',
      });
      expect(lastOwnerDemote.json().error.code).toBe('LAST_OWNER');
      expect(await t.prisma.householdMember.count({ where: { householdId: hid, role: 'OWNER' } })).toBe(1);
    });

    it('keeps exactly one OWNER when two owners demote each other concurrently', async () => {
      const { owner, household, others } = await householdWith(['OWNER']);
      const second = others[0]!;
      const hid = household.id;
      const [a, b] = await Promise.all([
        owner.client.patch(`/api/households/${hid}/members/${second.user.id}`, { role: 'MEMBER' }),
        second.client.patch(`/api/households/${hid}/members/${owner.user.id}`, { role: 'MEMBER' }),
      ]);
      const statuses = [a.statusCode, b.statusCode].sort();
      // Serialised by the household row lock: one demotion wins, the loser is no OWNER anymore (403).
      expect(statuses).toEqual([200, 403]);
      expect(await t.prisma.householdMember.count({ where: { householdId: hid, role: 'OWNER' } })).toBe(1);
    });
  });

  describe('leaving and removal', () => {
    async function directConversation(household: TestHousehold, userA: string, userB: string) {
      const [min, max] = [userA, userB].sort();
      return t.prisma.conversation.create({
        data: {
          householdId: household.id,
          type: 'DIRECT',
          directKey: `${household.id}:${min}:${max}`,
          members: { create: [{ userId: userA }, { userId: userB }] },
        },
      });
    }

    it('leaving removes the membership and every conversation membership of that household', async () => {
      const { owner, household, others } = await householdWith(['MEMBER']);
      const member = others[0]!;
      const elsewhere = await createHousehold(t.prisma, member.user.id, 'Anderer Haushalt');
      await directConversation(household, owner.user.id, member.user.id);
      await t.prisma.user.update({ where: { id: member.user.id }, data: { lastHouseholdId: household.id } });
      const emitToUsers = vi.spyOn(t.app.realtime, 'emitToUsers');
      const emitSync = vi.spyOn(t.app.realtime, 'emitSync');

      const res = await member.client.delete(`/api/households/${household.id}/members/${member.user.id}`);
      expect(res.statusCode).toBe(204);

      expect(
        await t.prisma.householdMember.findUnique({
          where: { householdId_userId: { householdId: household.id, userId: member.user.id } },
        }),
      ).toBeNull();
      expect(
        await t.prisma.conversationMember.count({
          where: { userId: member.user.id, conversation: { householdId: household.id } },
        }),
      ).toBe(0);
      // Other households and the remaining member are untouched.
      expect(
        await t.prisma.conversationMember.count({
          where: { userId: member.user.id, conversation: { householdId: elsewhere.id } },
        }),
      ).toBe(1);
      expect(
        await t.prisma.conversationMember.count({
          where: { userId: owner.user.id, conversation: { householdId: household.id } },
        }),
      ).toBe(2);
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: member.user.id } })).lastHouseholdId).toBeNull();

      const activity = await t.prisma.householdActivity.findFirstOrThrow({
        where: { householdId: household.id, type: 'MEMBER_LEFT' },
      });
      expect(activity).toMatchObject({ actorId: member.user.id, entityId: member.user.id });
      expect(activity.meta).toMatchObject({ displayName: 'Person 1' });

      expect(emitToUsers).toHaveBeenCalledWith([member.user.id], 'membership', {
        householdId: household.id,
        action: 'removed',
      });
      expect(emitSync).toHaveBeenCalledWith(
        expect.objectContaining({ householdId: household.id, scope: 'members', action: 'deleted' }),
      );
      expect((await member.client.get(`/api/households/${household.id}`)).statusCode).toBe(404);
    });

    it('removal by the OWNER records MEMBER_REMOVED; unknown members are 404', async () => {
      const { owner, household, others } = await householdWith(['MEMBER']);
      const member = others[0]!;
      expect((await owner.client.delete(`/api/households/${household.id}/members/${member.user.id}`)).statusCode).toBe(
        204,
      );
      const activity = await t.prisma.householdActivity.findFirstOrThrow({
        where: { householdId: household.id, type: 'MEMBER_REMOVED' },
      });
      expect(activity).toMatchObject({ actorId: owner.user.id, entityId: member.user.id });
      expect((await owner.client.delete(`/api/households/${household.id}/members/${member.user.id}`)).statusCode).toBe(
        404,
      );
      expect((await owner.client.delete(`/api/households/${household.id}/members/not-a-uuid`)).statusCode).toBe(404);
    });

    // Regression (review): ids are matched case-insensitively by PostgreSQL but Socket.IO rooms are
    // exact strings – an upper-case URL used to leave the removed user's sockets in the room.
    it.each([
      ['lower-case', (id: string) => id],
      ['upper-case', (id: string) => id.toUpperCase()],
    ] as const)('moves a removed user out of the household socket room and tells them (%s ids)', async (_, ids) => {
      const { owner, household, others } = await householdWith(['MEMBER']);
      const member = others[0]!;
      const socket: ClientSocket = connect(baseUrl, {
        path: SOCKET_PATH,
        transports: ['websocket'],
        extraHeaders: { origin: TEST_APP_URL, cookie: member.client.cookieHeader() },
        reconnection: false,
        forceNew: true,
      });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => resolve());
        socket.on('connect_error', reject);
      });
      const inRoom = async () =>
        (await t.app.realtime.io.in(householdRoom(household.id)).fetchSockets()).some(
          (s) => s.data.userId === member.user.id,
        );
      await vi.waitFor(async () => expect(await inRoom()).toBe(true));

      const event = new Promise<MembershipEvent>((resolve) => socket.on('membership', resolve));
      const syncs: unknown[] = [];
      socket.on('sync', (sync) => syncs.push(sync));
      const res = await owner.client.delete(`/api/households/${ids(household.id)}/members/${ids(member.user.id)}`);
      expect(res.statusCode).toBe(204);
      expect(await event).toEqual({ householdId: household.id, action: 'removed' });
      expect(await inRoom()).toBe(false);
      const activity = await t.prisma.householdActivity.findFirstOrThrow({
        where: { householdId: household.id, type: 'MEMBER_REMOVED' },
      });
      expect(activity.entityId).toBe(member.user.id);

      // Later household events no longer reach the removed user.
      expect((await owner.client.patch(`/api/households/${household.id}`, { name: 'Neu' })).statusCode).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(syncs).toEqual([]);
    });

    it('lets a member leave with upper-case ids in the URL', async () => {
      const { household, others } = await householdWith(['MEMBER']);
      const member = others[0]!;
      const emitToUsers = vi.spyOn(t.app.realtime, 'emitToUsers');
      const syncUserRooms = vi.spyOn(t.app.realtime, 'syncUserRooms');
      const res = await member.client.delete(
        `/api/households/${household.id.toUpperCase()}/members/${member.user.id.toUpperCase()}`,
      );
      expect(res.statusCode).toBe(204);
      expect(emitToUsers).toHaveBeenCalledWith([member.user.id], 'membership', {
        householdId: household.id,
        action: 'removed',
      });
      expect(syncUserRooms).toHaveBeenCalledWith(member.user.id);
      const activity = await t.prisma.householdActivity.findFirstOrThrow({
        where: { householdId: household.id, type: 'MEMBER_LEFT' },
      });
      expect(activity).toMatchObject({ actorId: member.user.id, entityId: member.user.id });
    });
  });

  // Regression (review, high): links must not outlive their creator's right to invite.
  describe('invitation links of members who lose the right to invite', () => {
    const TOKEN_IN_URL = /\/einladung\/([A-Za-z0-9_-]{43})$/;

    async function invite(client: TestClient, householdId: string, role: 'MEMBER' | 'ADMIN' = 'ADMIN') {
      const res = await client.post(`/api/households/${householdId}/invitations`, { role, expiresInDays: 30 });
      expect(res.statusCode).toBe(201);
      const body = res.json<{ id: string; url: string }>();
      const token = TOKEN_IN_URL.exec(body.url)?.[1];
      if (!token) throw new Error(`unexpected invitation url ${body.url}`);
      return { id: body.id, token };
    }

    async function expectRevoked(token: string, joiner: TestClient) {
      expect((await t.client().get(`/api/invitations/${token}`)).json().status).toBe('revoked');
      const res = await joiner.post(`/api/invitations/${token}/accept`);
      expect(res.statusCode).toBe(410);
      expect(res.json().error).toMatchObject({ code: 'INVITATION_INVALID', details: { status: 'revoked' } });
    }

    it('a removed ADMIN cannot rejoin (or let others join) through their own links', async () => {
      const { owner, household, others } = await householdWith(['ADMIN']);
      const admin = others[0]!;
      const own = await invite(admin.client, household.id);
      const ownerLink = await invite(owner.client, household.id);
      const emitSync = vi.spyOn(t.app.realtime, 'emitSync');

      expect((await owner.client.delete(`/api/households/${household.id}/members/${admin.user.id}`)).statusCode).toBe(
        204,
      );
      const row = await t.prisma.householdInvitation.findUniqueOrThrow({ where: { id: own.id } });
      expect(row.revokedAt).toBeInstanceOf(Date);
      expect(emitSync).toHaveBeenCalledWith(
        expect.objectContaining({ householdId: household.id, scope: 'members', action: 'deleted' }),
      );

      await expectRevoked(own.token, admin.client);
      const stranger = await createLoggedInUser(t.app);
      await expectRevoked(own.token, stranger.client);
      expect((await admin.client.get(`/api/households/${household.id}`)).statusCode).toBe(404);
      // The owner's own link is untouched.
      const list = (await owner.client.get(`/api/households/${household.id}/invitations`)).json<
        Array<{ id: string }>
      >();
      expect(list.map((i) => i.id)).toEqual([ownerLink.id]);
    });

    it('leaving revokes the links the leaving ADMIN created', async () => {
      const { household, others } = await householdWith(['ADMIN']);
      const admin = others[0]!;
      const own = await invite(admin.client, household.id, 'MEMBER');
      expect((await admin.client.delete(`/api/households/${household.id}/members/${admin.user.id}`)).statusCode).toBe(
        204,
      );
      await expectRevoked(own.token, admin.client);
    });

    it('demotion to MEMBER revokes their links; OWNER → ADMIN keeps them', async () => {
      const { owner, household, others } = await householdWith(['ADMIN', 'OWNER']);
      const [admin, coOwner] = [others[0]!, others[1]!];
      const adminLink = await invite(admin.client, household.id);
      const coOwnerLink = await invite(coOwner.client, household.id);

      const demote = await owner.client.patch(`/api/households/${household.id}/members/${admin.user.id}`, {
        role: 'MEMBER',
      });
      expect(demote.statusCode).toBe(200);
      expect((await admin.client.post(`/api/households/${household.id}/invitations`, {})).statusCode).toBe(403);
      const second = await createLoggedInUser(t.app);
      await expectRevoked(adminLink.token, second.client);

      // An OWNER who becomes ADMIN may still invite – their links stay valid.
      const stepDown = await owner.client.patch(`/api/households/${household.id}/members/${coOwner.user.id}`, {
        role: 'ADMIN',
      });
      expect(stepDown.statusCode).toBe(200);
      expect((await second.client.post(`/api/invitations/${coOwnerLink.token}/accept`)).statusCode).toBe(200);
      const joined = await t.prisma.householdMember.findUniqueOrThrow({
        where: { householdId_userId: { householdId: household.id, userId: second.user.id } },
      });
      expect(joined.role).toBe('ADMIN');
    });

    it('treats links whose creator is no OWNER/ADMIN any more as revoked (defence in depth)', async () => {
      const { owner, household, others } = await householdWith(['ADMIN']);
      const admin = others[0]!;
      const own = await invite(admin.client, household.id);
      // Bypass the service (e.g. a legacy row, or the creator's account was deleted elsewhere).
      await t.prisma.householdMember.update({
        where: { householdId_userId: { householdId: household.id, userId: admin.user.id } },
        data: { role: 'MEMBER' },
      });
      expect(
        (await owner.client.get(`/api/households/${household.id}/invitations`)).json<Array<{ id: string }>>(),
      ).toEqual([]);
      const joiner = await createLoggedInUser(t.app);
      await expectRevoked(own.token, joiner.client);

      const deleted = await invite(owner.client, household.id);
      await t.prisma.householdInvitation.update({ where: { id: deleted.id }, data: { createdById: null } });
      await expectRevoked(deleted.token, joiner.client);
      expect(await t.prisma.householdMember.count({ where: { householdId: household.id } })).toBe(2);
    });

    it('never leaves an active link of a demoted ADMIN behind when invite and demotion race', async () => {
      for (let run = 0; run < 8; run++) {
        const { owner, household, others } = await householdWith(['ADMIN']);
        const admin = others[0]!;
        const [created, demoted] = await Promise.all([
          admin.client.post(`/api/households/${household.id}/invitations`, { role: 'ADMIN' }),
          owner.client.patch(`/api/households/${household.id}/members/${admin.user.id}`, { role: 'MEMBER' }),
        ]);
        expect(demoted.statusCode).toBe(200);
        expect([201, 403]).toContain(created.statusCode);
        expect(
          await t.prisma.householdInvitation.count({
            where: { householdId: household.id, createdById: admin.user.id, revokedAt: null },
          }),
        ).toBe(0);
      }
    });
  });

  describe('rename and delete', () => {
    it('renames (ADMIN+) and broadcasts a household sync', async () => {
      const { owner, household } = await householdWith([]);
      const emitSync = vi.spyOn(t.app.realtime, 'emitSync');
      const res = await owner.client.patch(`/api/households/${household.id}`, { name: 'WG Basel' });
      expect(HouseholdDetailSchema.parse(res.json()).name).toBe('WG Basel');
      expect(emitSync).toHaveBeenCalledWith({
        householdId: household.id,
        scope: 'household',
        action: 'updated',
        entityId: household.id,
        actorId: owner.user.id,
      });
      expect((await owner.client.patch(`/api/households/${household.id}`, { name: '' })).statusCode).toBe(400);
    });

    it('deletes everything of the household (incl. stored images) and nothing of others', async () => {
      const { owner, household, others } = await householdWith(['MEMBER']);
      const other = await householdWith([]);
      const image = await t.prisma.inventoryImage.create({
        data: {
          householdId: household.id,
          storageKey: `${household.id}/placeholder`,
          mimeType: 'image/webp',
          width: 10,
          height: 10,
          byteSize: 10,
        },
      });
      await t.prisma.inventoryImage.update({
        where: { id: image.id },
        data: { storageKey: `${household.id}/${image.id}` },
      });
      await t.prisma.inventoryItem.create({ data: { householdId: household.id, name: 'Milch', imageId: image.id } });
      const thumbKey = `${household.id}/${image.id}-thumb.webp`;
      const otherKey = `${other.household.id}/${image.id}-thumb.webp`;
      await t.storage.put(thumbKey, Buffer.from('webp'));
      await t.storage.put(otherKey, Buffer.from('webp'));
      await t.prisma.inventoryItem.create({ data: { householdId: other.household.id, name: 'Kaffee' } });
      await t.prisma.user.update({ where: { id: others[0]!.user.id }, data: { lastHouseholdId: household.id } });
      const emitToUsers = vi.spyOn(t.app.realtime, 'emitToUsers');

      const res = await owner.client.delete(`/api/households/${household.id}`);
      expect(res.statusCode).toBe(204);

      const where = { householdId: household.id };
      const counts = await Promise.all([
        t.prisma.householdMember.count({ where }),
        t.prisma.inventoryItem.count({ where }),
        t.prisma.inventoryImage.count({ where }),
        t.prisma.shoppingList.count({ where }),
        t.prisma.conversation.count({ where }),
        t.prisma.householdActivity.count({ where }),
        t.prisma.householdInvitation.count({ where }),
      ]);
      expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0]);
      expect(await t.storage.exists(thumbKey)).toBe(false);
      expect(await t.storage.exists(otherKey)).toBe(true);
      expect(await t.prisma.inventoryItem.count({ where: { householdId: other.household.id } })).toBe(1);
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: others[0]!.user.id } })).lastHouseholdId).toBeNull();
      expect(emitToUsers).toHaveBeenCalledWith(
        expect.arrayContaining([owner.user.id, others[0]!.user.id]),
        'membership',
        { householdId: household.id, action: 'removed' },
      );
    });

    // Regression (review r3): the deletion locked the household row first and the cascade then
    // waited for item rows, while quantity taps / shopping ticks lock their item first and then the
    // household (activity FK) → PostgreSQL deadlock → 409 "Das ist bereits vorhanden." in 5 of 6 runs.
    it('deletes the household while members keep tapping quantities and ticking shopping items', async () => {
      const statuses: number[] = [];
      for (let run = 0; run < 8; run += 1) {
        const { owner, household, others } = await householdWith(['MEMBER']);
        const member = others[0]!.client;
        const items: string[] = [];
        for (const name of ['Milch', 'Kaffee']) {
          const created = await member.post(`/api/households/${household.id}/items`, {
            name,
            category: 'SONSTIGES',
            quantity: '5',
            unit: 'STUECK',
            unitPrice: '2.00',
            imageId: null,
          });
          expect(created.statusCode).toBe(201);
          items.push(created.json<{ id: string }>().id);
        }
        const shopping = await member.post(`/api/households/${household.id}/shopping/items`, { name: 'Brot' });
        expect(shopping.statusCode).toBe(201);
        const shoppingId = shopping.json<{ id: string }>().id;

        const writes = [
          ...items.flatMap((id) => [
            member.post(`/api/households/${household.id}/items/${id}/quantity`, { delta: '1' }),
            member.post(`/api/households/${household.id}/items/${id}/quantity`, { delta: '-1' }),
          ]),
          member.patch(`/api/households/${household.id}/shopping/items/${shoppingId}`, { completed: true }),
        ];
        const [deleted, ...written] = await Promise.all([
          owner.client.delete(`/api/households/${household.id}`),
          ...writes,
        ]);
        statuses.push(deleted.statusCode);
        // Writers either finished before the deletion or find the household gone – never a 5xx.
        for (const res of written) expect([200, 404]).toContain(res.statusCode);
        expect(await t.prisma.household.count({ where: { id: household.id } })).toBe(0);
      }
      expect(statuses).toEqual(Array.from({ length: 8 }, () => 204));
    });

    it('retries a deletion that PostgreSQL aborted as a deadlock victim', async () => {
      const { owner, household } = await householdWith([]);
      const deadlock = Object.assign(new Error('Transaction failed due to a write conflict or a deadlock'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2034',
      });
      const transaction = vi.spyOn(t.app.prisma, '$transaction').mockRejectedValueOnce(deadlock);
      const res = await owner.client.delete(`/api/households/${household.id}`);
      expect(res.statusCode).toBe(204);
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(await t.prisma.household.count({ where: { id: household.id } })).toBe(0);
    });

    it('answers a retryable 409 (not "bereits vorhanden") when every attempt deadlocks', async () => {
      const { owner, household } = await householdWith([]);
      const deadlock = Object.assign(new Error('deadlock detected'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2034',
      });
      const transaction = vi.spyOn(t.app.prisma, '$transaction').mockRejectedValue(deadlock);
      const res = await owner.client.delete(`/api/households/${household.id}`);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('CONFLICT');
      expect(res.json().error.message).toBe(
        'Im Haushalt wird gerade etwas geändert. Bitte versuche es in einem Moment nochmals.',
      );
      expect(transaction).toHaveBeenCalledTimes(DELETE_HOUSEHOLD_ATTEMPTS);
      expect(await t.prisma.household.count({ where: { id: household.id } })).toBe(1);
    });
  });
});
