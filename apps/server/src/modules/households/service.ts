import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import {
  DEFAULT_SHOPPING_LIST_NAME,
  INVITATION_PATH_PREFIX,
  type AcceptInvitationResponse,
  type CreatedInvitation,
  type HouseholdDetail,
  type HouseholdRole,
  type InvitationPreview,
  type InvitationRole,
  type InvitationStatus,
} from '@homi/shared';
import type { Db, Prisma, Tx } from '../../db';
import { AppError } from '../../lib/http-errors';
import { createHashedToken, hashToken, isWellFormedToken } from '../../lib/tokens';
import { recordActivity } from '../activity/service';
import { lockUserRow } from '../auth/credentials';
import {
  invitationStatus,
  memberDtoSelect,
  memberOrderBy,
  toHouseholdDetail,
  toInvitationRole,
  type MemberRow,
} from './dto';

/*
 * Household domain logic (§3 household creation, §4.4 role rules, §5 households/members/invitations).
 * Every write runs in one transaction; realtime events are emitted by the caller-facing functions
 * only after the transaction committed.
 *
 * Locking: membership and invitation changes of a household lock its `Household` row first and
 * only then invitation rows (same order everywhere → no deadlocks). Ids taken from the URL are
 * only used for lookups; events, activities and further queries use the ids as stored.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Upper bound of simultaneously active invitation links per household (abuse guard). */
export const MAX_ACTIVE_INVITATIONS = 50;

/** Households one user may own at the same time (abuse guard; deleting one makes room again). */
export const MAX_OWNED_HOUSEHOLDS = 20;

/** Roles that may create invitations – and whose links stay valid only while they keep that role. */
const INVITER_ROLES: readonly HouseholdRole[] = ['OWNER', 'ADMIN'];

function canInvite(role: HouseholdRole): boolean {
  return INVITER_ROLES.includes(role);
}

/**
 * Locks the household row (serialises role changes, removals, last-owner checks and invitation
 * create/revoke/accept). Returns the id as stored (canonical lower-case uuid), or `null` if the
 * household does not exist (any more).
 */
async function lockHousehold(tx: Tx, householdId: string): Promise<string | null> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"::text AS "id" FROM "Household" WHERE "id" = ${householdId}::uuid FOR UPDATE`;
  return rows[0]?.id ?? null;
}

async function countOwners(db: Db, householdId: string): Promise<number> {
  return db.householdMember.count({ where: { householdId, role: 'OWNER' } });
}

export async function loadHouseholdDetail(
  db: Db,
  householdId: string,
  myRole: HouseholdRole,
): Promise<HouseholdDetail> {
  const [household, members, itemCount] = await Promise.all([
    db.household.findUnique({ where: { id: householdId }, select: { id: true, name: true, createdAt: true } }),
    db.householdMember.findMany({ where: { householdId }, orderBy: memberOrderBy, select: memberDtoSelect }),
    db.inventoryItem.count({ where: { householdId } }),
  ]);
  if (!household) throw new AppError('NOT_FOUND');
  return toHouseholdDetail({ household, myRole, members, itemCount });
}

// ---------------------------------------------------------------------------
// Households
// ---------------------------------------------------------------------------

/**
 * Creates a household in ONE transaction: household, OWNER membership, default shopping list,
 * HOUSEHOLD conversation with the owner, HOUSEHOLD_CREATED activity; makes it the active household.
 */
export async function createHousehold(
  app: FastifyInstance,
  owner: { id: string },
  name: string,
): Promise<HouseholdDetail> {
  const household = await app.prisma.$transaction(async (tx) => {
    // The user row serialises concurrent creations of the same user, so the cap cannot be raced.
    if (!(await lockUserRow(tx, owner.id))) throw new AppError('UNAUTHORIZED');
    const owned = await tx.householdMember.count({ where: { userId: owner.id, role: 'OWNER' } });
    if (owned >= MAX_OWNED_HOUSEHOLDS) {
      throw new AppError(
        'CONFLICT',
        `Du kannst höchstens ${MAX_OWNED_HOUSEHOLDS} eigene Haushalte haben. Lösche zuerst einen Haushalt, den du nicht mehr brauchst.`,
      );
    }
    const created = await tx.household.create({
      data: { name, createdById: owner.id },
      select: { id: true, name: true, createdAt: true },
    });
    await tx.householdMember.create({ data: { householdId: created.id, userId: owner.id, role: 'OWNER' } });
    await tx.shoppingList.create({ data: { householdId: created.id, name: DEFAULT_SHOPPING_LIST_NAME } });
    await tx.conversation.create({
      data: { householdId: created.id, type: 'HOUSEHOLD', members: { create: { userId: owner.id } } },
    });
    await recordActivity(tx, {
      householdId: created.id,
      actorId: owner.id,
      type: 'HOUSEHOLD_CREATED',
      entityType: 'household',
      entityId: created.id,
      meta: { name: created.name },
    });
    await tx.user.update({ where: { id: owner.id }, data: { lastHouseholdId: created.id } });
    return created;
  });

  await notifyMembershipAdded(app, household.id, owner.id);
  return loadHouseholdDetail(app.prisma, household.id, 'OWNER');
}

export async function renameHousehold(
  app: FastifyInstance,
  actor: { id: string; role: HouseholdRole },
  householdId: string,
  name: string,
): Promise<HouseholdDetail> {
  await app.prisma.household.update({ where: { id: householdId }, data: { name } });
  app.realtime.emitSync({
    householdId,
    scope: 'household',
    action: 'updated',
    entityId: householdId,
    actorId: actor.id,
  });
  return loadHouseholdDetail(app.prisma, householdId, actor.role);
}

/** How often a household deletion is attempted when PostgreSQL aborts it as a deadlock victim. */
export const DELETE_HOUSEHOLD_ATTEMPTS = 4;

const DELETE_RETRY_MESSAGE = 'Im Haushalt wird gerade etwas geändert. Bitte versuche es in einem Moment nochmals.';

/**
 * Deadlock (40P01) or serialization failure (40001): the Prisma driver adapter reports both as
 * P2034 – for model and raw queries alike. The transaction was rolled back and may be retried.
 */
export function isTransactionConflict(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 4; depth += 1) {
    if (typeof current !== 'object') return false;
    const { code, originalCode } = current as { code?: unknown; originalCode?: unknown };
    if (code === 'P2034' || originalCode === '40P01' || originalCode === '40001') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Locks the household's inventory and shopping items (in id order). The inventory and shopping
 * writers lock an item row first and then – through the foreign key of their activity insert –
 * take `FOR KEY SHARE` on the household row. Deleting the household locks the household row and
 * then needs every item row for the cascade, i.e. the opposite order: taking the item locks first
 * makes the deletion wait for those writers instead of deadlocking with them.
 */
async function lockHouseholdItems(tx: Tx, householdId: string): Promise<void> {
  await tx.$executeRaw`
    SELECT "id" FROM "InventoryItem" WHERE "householdId" = ${householdId}::uuid ORDER BY "id" FOR UPDATE`;
  await tx.$executeRaw`
    SELECT "id" FROM "ShoppingItem" WHERE "householdId" = ${householdId}::uuid ORDER BY "id" FOR UPDATE`;
}

/**
 * Deletes a household (OWNER). The FK cascades remove members, invitations, items, images,
 * shopping lists, conversations and activities; the stored image files are removed after commit.
 * Writers with other lock orders (images, chat) can still make PostgreSQL pick the deletion as a
 * deadlock victim: the whole transaction is then retried, and only if every attempt fails the
 * client gets a 409 asking to try again (never the generic "Das ist bereits vorhanden.").
 */
export async function deleteHousehold(app: FastifyInstance, actorId: string, householdId: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await deleteHouseholdOnce(app, actorId, householdId);
      return;
    } catch (error) {
      if (!isTransactionConflict(error)) throw error;
      if (attempt >= DELETE_HOUSEHOLD_ATTEMPTS) {
        app.log.warn({ householdId, attempts: attempt }, 'household deletion kept deadlocking');
        throw new AppError('CONFLICT', DELETE_RETRY_MESSAGE, { cause: error });
      }
      // Short jittered pause: let the competing writers commit before the next attempt.
      await new Promise((resolve) => setTimeout(resolve, 15 * attempt + Math.floor(Math.random() * 25)));
    }
  }
}

async function deleteHouseholdOnce(app: FastifyInstance, actorId: string, householdId: string): Promise<void> {
  const { hid, memberIds } = await app.prisma.$transaction(async (tx) => {
    await lockHouseholdItems(tx, householdId);
    const lockedId = await lockHousehold(tx, householdId);
    if (!lockedId) throw new AppError('NOT_FOUND');
    const actor = await tx.householdMember.findUnique({
      where: { householdId_userId: { householdId: lockedId, userId: actorId } },
      select: { role: true },
    });
    if (!actor) throw new AppError('NOT_FOUND');
    if (actor.role !== 'OWNER') throw new AppError('FORBIDDEN');
    const members = await tx.householdMember.findMany({ where: { householdId: lockedId }, select: { userId: true } });
    await tx.user.updateMany({ where: { lastHouseholdId: lockedId }, data: { lastHouseholdId: null } });
    await tx.household.delete({ where: { id: lockedId } });
    return { hid: lockedId, memberIds: members.map((m) => m.userId) };
  });

  await removeStoredImages(app, hid);
  app.realtime.emitToUsers(memberIds, 'membership', { householdId: hid, action: 'removed' });
  await syncRooms(app, memberIds);
}

async function removeStoredImages(app: FastifyInstance, householdId: string): Promise<void> {
  try {
    // Image keys are `<householdId>/<imageId>-<variant>.webp` (lib/storage.ts).
    await app.storage.deletePrefix(householdId.toLowerCase());
  } catch (error) {
    // The DB rows are gone already; orphaned files are harmless but should be noticed.
    app.log.error({ err: error, householdId }, 'failed to delete stored images of a deleted household');
  }
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

/**
 * Revokes every still-active invitation link `userId` created in the household. Runs when that
 * user leaves, is removed or loses the right to invite (demotion to MEMBER): otherwise a removed
 * ADMIN could rejoin – or let others join as ADMIN – through links they kept.
 */
async function revokeInvitationsCreatedBy(tx: Tx, householdId: string, userId: string): Promise<number> {
  const { count } = await tx.householdInvitation.updateMany({
    where: { householdId, createdById: userId, revokedAt: null, acceptedAt: null },
    data: { revokedAt: new Date() },
  });
  return count;
}

/**
 * OWNER only; the last OWNER cannot be demoted (409 LAST_OWNER). Demotion to MEMBER also revokes
 * the member's active invitation links (same transaction).
 */
export async function changeMemberRole(
  app: FastifyInstance,
  actorId: string,
  householdId: string,
  userId: string,
  role: HouseholdRole,
): Promise<MemberRow> {
  const { member, changed, hid } = await app.prisma.$transaction(async (tx) => {
    const lockedId = await lockHousehold(tx, householdId);
    if (!lockedId) throw new AppError('NOT_FOUND');
    const actor = await tx.householdMember.findUnique({
      where: { householdId_userId: { householdId: lockedId, userId: actorId } },
      select: { role: true },
    });
    if (!actor) throw new AppError('NOT_FOUND');
    if (actor.role !== 'OWNER') throw new AppError('FORBIDDEN');
    const target = await tx.householdMember.findUnique({
      where: { householdId_userId: { householdId: lockedId, userId } },
      select: { id: true, role: true, userId: true },
    });
    if (!target) throw new AppError('NOT_FOUND', 'Dieses Mitglied gibt es in deinem Haushalt nicht.');
    if (target.role === role) {
      const unchanged = await tx.householdMember.findUniqueOrThrow({
        where: { id: target.id },
        select: memberDtoSelect,
      });
      return { member: unchanged, changed: false, hid: lockedId };
    }
    if (target.role === 'OWNER' && (await countOwners(tx, lockedId)) <= 1) throw new AppError('LAST_OWNER');
    const updated = await tx.householdMember.update({
      where: { id: target.id },
      data: { role },
      select: memberDtoSelect,
    });
    if (!canInvite(role)) await revokeInvitationsCreatedBy(tx, lockedId, target.userId);
    return { member: updated, changed: true, hid: lockedId };
  });

  if (changed) {
    app.realtime.emitSync({
      householdId: hid,
      scope: 'members',
      action: 'updated',
      entityId: member.userId,
      actorId,
    });
  }
  return member;
}

/**
 * Leave (`userId` = actor) or remove a member:
 * - everybody may leave, except the last OWNER (409 LAST_OWNER – delete the household instead);
 * - ADMIN may remove MEMBERs, OWNER may remove anyone but the last OWNER; MEMBERs remove nobody (403).
 * The user also leaves every conversation of the household, and the invitation links they created
 * are revoked. Events go to the stored ids (Socket.IO room names are case-sensitive strings).
 */
export async function removeMember(
  app: FastifyInstance,
  actorId: string,
  householdId: string,
  userId: string,
): Promise<void> {
  const removed = await app.prisma.$transaction(async (tx) => {
    const hid = await lockHousehold(tx, householdId);
    if (!hid) throw new AppError('NOT_FOUND');
    const actor = await tx.householdMember.findUnique({
      where: { householdId_userId: { householdId: hid, userId: actorId } },
      select: { role: true, userId: true },
    });
    if (!actor) throw new AppError('NOT_FOUND');
    const target = await tx.householdMember.findUnique({
      where: { householdId_userId: { householdId: hid, userId } },
      select: { id: true, role: true, userId: true, user: { select: { displayName: true } } },
    });
    if (!target) throw new AppError('NOT_FOUND', 'Dieses Mitglied gibt es in deinem Haushalt nicht.');
    const isSelf = target.userId === actor.userId;

    if (!isSelf) {
      const allowed = actor.role === 'OWNER' || (actor.role === 'ADMIN' && target.role === 'MEMBER');
      if (!allowed) throw new AppError('FORBIDDEN');
    }
    if (target.role === 'OWNER' && (await countOwners(tx, hid)) <= 1) {
      throw new AppError(
        'LAST_OWNER',
        isSelf
          ? 'Du bist die letzte Inhaberin bzw. der letzte Inhaber. Übertrage die Rolle zuerst oder lösche den Haushalt.'
          : undefined,
      );
    }

    const targetId = target.userId;
    await tx.conversationMember.deleteMany({ where: { userId: targetId, conversation: { householdId: hid } } });
    await tx.householdMember.delete({ where: { id: target.id } });
    await revokeInvitationsCreatedBy(tx, hid, targetId);
    await tx.user.updateMany({ where: { id: targetId, lastHouseholdId: hid }, data: { lastHouseholdId: null } });
    await recordActivity(tx, {
      householdId: hid,
      actorId: actor.userId,
      type: isSelf ? 'MEMBER_LEFT' : 'MEMBER_REMOVED',
      entityType: 'member',
      entityId: targetId,
      meta: { displayName: target.user.displayName, role: target.role },
    });
    return { householdId: hid, userId: targetId, actorId: actor.userId };
  });

  app.realtime.emitToUsers([removed.userId], 'membership', { householdId: removed.householdId, action: 'removed' });
  await syncRooms(app, [removed.userId]);
  app.realtime.emitSync({
    householdId: removed.householdId,
    scope: 'members',
    action: 'deleted',
    entityId: removed.userId,
    actorId: removed.actorId,
  });
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export function invitationUrl(app: FastifyInstance, token: string): string {
  return `${app.config.appUrl}${INVITATION_PATH_PREFIX}${token}`;
}

/**
 * Active = not revoked, not used, not expired, and the creator is still an OWNER/ADMIN of the
 * household (covers creators whose account was deleted – `createdById` is then `null`).
 */
export function activeInvitationWhere(
  householdId: string,
  now: Date = new Date(),
): Prisma.HouseholdInvitationWhereInput {
  return {
    householdId,
    revokedAt: null,
    acceptedAt: null,
    expiresAt: { gt: now },
    createdBy: { memberships: { some: { householdId, role: { in: [...INVITER_ROLES] } } } },
  };
}

/** Whether the invitation's creator is still an OWNER/ADMIN of the household. */
async function inviterStillAuthorised(db: Db, householdId: string, createdById: string | null): Promise<boolean> {
  if (!createdById) return false; // the creator's account was deleted
  const membership = await db.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId: createdById } },
    select: { role: true },
  });
  return membership !== null && canInvite(membership.role);
}

/**
 * Status as seen by the invitee: a link whose creator left, was removed or demoted counts as
 * revoked even if the row was not revoked explicitly (defence in depth).
 */
async function effectiveInvitationStatus(
  db: Db,
  invitation: {
    householdId: string;
    createdById: string | null;
    expiresAt: Date;
    revokedAt: Date | null;
    acceptedAt: Date | null;
  },
): Promise<InvitationStatus> {
  const status = invitationStatus(invitation);
  if (status !== 'valid') return status;
  return (await inviterStillAuthorised(db, invitation.householdId, invitation.createdById)) ? 'valid' : 'revoked';
}

/**
 * Creates an invitation; the raw token appears only in the returned `url` (the DB keeps its HMAC).
 * The creator's role is re-checked under the household lock (a concurrent demotion must not leave
 * a fresh link behind) and at most {@link MAX_ACTIVE_INVITATIONS} links may be active.
 */
export async function createInvitation(
  app: FastifyInstance,
  actorId: string,
  householdId: string,
  input: { role: InvitationRole; expiresInDays: number },
): Promise<CreatedInvitation> {
  const { token, tokenHash } = createHashedToken(app.config.sessionSecret);
  const invitation = await app.prisma.$transaction(async (tx) => {
    const hid = await lockHousehold(tx, householdId);
    if (!hid) throw new AppError('NOT_FOUND');
    const actor = await tx.householdMember.findUnique({
      where: { householdId_userId: { householdId: hid, userId: actorId } },
      select: { role: true },
    });
    if (!actor) throw new AppError('NOT_FOUND');
    if (!canInvite(actor.role)) throw new AppError('FORBIDDEN');
    const active = await tx.householdInvitation.count({ where: activeInvitationWhere(hid) });
    if (active >= MAX_ACTIVE_INVITATIONS) {
      throw new AppError(
        'CONFLICT',
        `Es gibt bereits ${MAX_ACTIVE_INVITATIONS} aktive Einladungslinks. Widerrufe zuerst Links, die du nicht mehr brauchst.`,
      );
    }
    return tx.householdInvitation.create({
      data: {
        householdId: hid,
        tokenHash,
        role: input.role,
        createdById: actorId,
        expiresAt: new Date(Date.now() + input.expiresInDays * DAY_MS),
      },
      select: { id: true, householdId: true, role: true, expiresAt: true },
    });
  });
  app.realtime.emitSync({
    householdId: invitation.householdId,
    scope: 'members',
    action: 'created',
    entityId: invitation.id,
    actorId,
  });
  return {
    id: invitation.id,
    url: invitationUrl(app, token),
    expiresAt: invitation.expiresAt.toISOString(),
    role: toInvitationRole(invitation.role),
  };
}

/**
 * Revokes an invitation of the household (idempotent); a used invitation cannot be revoked (409).
 * Runs under the household lock like `acceptInvitation`, so a concurrent accept either committed
 * first (→ 409 here) or sees the revocation (→ 410 there) – never "revoked" and joined at once.
 */
export async function revokeInvitation(
  app: FastifyInstance,
  actorId: string,
  householdId: string,
  invitationId: string,
): Promise<void> {
  const result = await app.prisma.$transaction(async (tx) => {
    const hid = await lockHousehold(tx, householdId);
    if (!hid) throw new AppError('NOT_FOUND', 'Diese Einladung gibt es nicht.');
    const invitation = await tx.householdInvitation.findFirst({
      where: { id: invitationId, householdId: hid },
      select: { id: true, revokedAt: true, acceptedAt: true },
    });
    if (!invitation) throw new AppError('NOT_FOUND', 'Diese Einladung gibt es nicht.');
    if (invitation.acceptedAt) throw new AppError('CONFLICT', 'Diese Einladung wurde bereits angenommen.');
    if (invitation.revokedAt) return null;
    await tx.householdInvitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } });
    return { householdId: hid, invitationId: invitation.id };
  });
  if (result) {
    app.realtime.emitSync({
      householdId: result.householdId,
      scope: 'members',
      action: 'deleted',
      entityId: result.invitationId,
      actorId,
    });
  }
}

const INVALID_INVITATION_MESSAGE = 'Diese Einladung ist ungültig.';

function tokenHashOrNull(app: FastifyInstance, token: string): string | null {
  return isWellFormedToken(token) ? hashToken(app.config.sessionSecret, token) : null;
}

/**
 * Public preview. Unknown or malformed tokens → 404 (same answer for both; one HMAC + one indexed
 * lookup per request). No member data is returned, and the household's and inviter's names only
 * while the link is still valid (a used/revoked/expired link stays readable for as long as the
 * household exists – it must not keep disclosing the current household name).
 */
export async function previewInvitation(app: FastifyInstance, token: string): Promise<InvitationPreview> {
  const tokenHash = tokenHashOrNull(app, token);
  const invitation = tokenHash
    ? await app.prisma.householdInvitation.findUnique({
        where: { tokenHash },
        select: {
          householdId: true,
          createdById: true,
          role: true,
          expiresAt: true,
          revokedAt: true,
          acceptedAt: true,
          household: { select: { name: true } },
          createdBy: { select: { displayName: true } },
        },
      })
    : null;
  if (!invitation) throw new AppError('NOT_FOUND', INVALID_INVITATION_MESSAGE);
  const status = await effectiveInvitationStatus(app.prisma, invitation);
  const valid = status === 'valid';
  return {
    householdName: valid ? invitation.household.name : null,
    inviterName: valid ? (invitation.createdBy?.displayName ?? null) : null,
    role: toInvitationRole(invitation.role),
    expiresAt: invitation.expiresAt.toISOString(),
    status,
  };
}

const STATUS_MESSAGES: Record<Exclude<InvitationStatus, 'valid'>, string> = {
  expired: 'Diese Einladung ist abgelaufen. Bitte frag nach einem neuen Link.',
  revoked: 'Diese Einladung wurde widerrufen.',
  used: 'Diese Einladung wurde bereits verwendet.',
};

/**
 * Accepts an invitation (single use). Household row, then invitation row are locked. An existing
 * member just gets the household id back (the invitation stays unused) and the household becomes
 * their active one. Otherwise the invitation must still be valid – including its creator still
 * being an OWNER/ADMIN – and the user joins the household and its HOUSEHOLD conversation, the
 * invitation is consumed and the household becomes active.
 */
export async function acceptInvitation(
  app: FastifyInstance,
  user: { id: string; displayName: string },
  token: string,
): Promise<AcceptInvitationResponse> {
  const tokenHash = tokenHashOrNull(app, token);
  if (!tokenHash) throw new AppError('NOT_FOUND', INVALID_INVITATION_MESSAGE);

  const result = await app.prisma.$transaction(async (tx) => {
    const ref = await tx.householdInvitation.findUnique({
      where: { tokenHash },
      select: { id: true, householdId: true },
    });
    if (!ref) throw new AppError('NOT_FOUND', INVALID_INVITATION_MESSAGE);
    // Lock order household → invitation (as revoke / remove / role change): neither the invitation
    // nor its creator's membership can change until this transaction ends.
    const householdId = await lockHousehold(tx, ref.householdId);
    if (!householdId) throw new AppError('NOT_FOUND', INVALID_INVITATION_MESSAGE); // deleted meanwhile
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "HouseholdInvitation" WHERE "id" = ${ref.id}::uuid FOR UPDATE`;
    if (locked.length === 0) throw new AppError('NOT_FOUND', INVALID_INVITATION_MESSAGE);
    const invitation = await tx.householdInvitation.findUniqueOrThrow({
      where: { id: ref.id },
      select: {
        id: true,
        householdId: true,
        createdById: true,
        role: true,
        expiresAt: true,
        revokedAt: true,
        acceptedAt: true,
      },
    });

    const existing = await tx.householdMember.findUnique({
      where: { householdId_userId: { householdId, userId: user.id } },
      select: { id: true },
    });
    if (existing) {
      // Nothing to consume – but the link was opened to get there: make it the active household
      // (the client switches to it and must not flip back on the next /auth/me).
      await tx.user.update({ where: { id: user.id }, data: { lastHouseholdId: householdId } });
      return { householdId, joined: false };
    }

    const status = await effectiveInvitationStatus(tx, invitation);
    if (status !== 'valid') {
      throw new AppError('INVITATION_INVALID', STATUS_MESSAGES[status], { details: { status } });
    }

    const role = toInvitationRole(invitation.role);
    await tx.householdMember.create({ data: { householdId, userId: user.id, role } });
    await joinHouseholdConversation(tx, householdId, user.id);
    await tx.householdInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date(), acceptedById: user.id },
    });
    await recordActivity(tx, {
      householdId,
      actorId: user.id,
      type: 'MEMBER_JOINED',
      entityType: 'member',
      entityId: user.id,
      meta: { displayName: user.displayName, role },
    });
    await tx.user.update({ where: { id: user.id }, data: { lastHouseholdId: householdId } });
    return { householdId, joined: true };
  });

  if (result.joined) {
    await notifyMembershipAdded(app, result.householdId, user.id);
    app.realtime.emitSync({
      householdId: result.householdId,
      scope: 'members',
      action: 'created',
      entityId: user.id,
      actorId: user.id,
    });
  }
  return { householdId: result.householdId };
}

/** Adds the user to the household conversation (creates it with all members if it is missing). */
async function joinHouseholdConversation(tx: Tx, householdId: string, userId: string): Promise<void> {
  const conversation = await tx.conversation.findFirst({
    where: { householdId, type: 'HOUSEHOLD' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (conversation) {
    await tx.conversationMember.createMany({
      data: [{ conversationId: conversation.id, userId }],
      skipDuplicates: true,
    });
    return;
  }
  const members = await tx.householdMember.findMany({ where: { householdId }, select: { userId: true } });
  await tx.conversation.create({
    data: {
      householdId,
      type: 'HOUSEHOLD',
      members: { create: members.map((m) => ({ userId: m.userId })) },
    },
  });
}

// ---------------------------------------------------------------------------
// Realtime helpers
// ---------------------------------------------------------------------------

async function notifyMembershipAdded(app: FastifyInstance, householdId: string, userId: string): Promise<void> {
  await syncRooms(app, [userId]);
  app.realtime.emitToUsers([userId], 'membership', { householdId, action: 'added' });
}

/** Room sync must never fail the (already committed) request. */
async function syncRooms(app: FastifyInstance, userIds: readonly string[]): Promise<void> {
  await Promise.all(
    userIds.map((userId) =>
      app.realtime.syncUserRooms(userId).catch((error: unknown) => logRealtimeError(app.log, error, userId)),
    ),
  );
}

function logRealtimeError(log: FastifyBaseLogger, error: unknown, userId: string): void {
  log.error({ err: error, userId }, 'failed to sync socket rooms after a membership change');
}
