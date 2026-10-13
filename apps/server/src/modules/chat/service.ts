import {
  ShoppingItemMessageMetaSchema,
  directConversationKey,
  shoppingItemMessageTitle,
  type ConversationDto,
  type ConversationType,
  type MessageDto,
  type MessageListParams,
  type MessagePage,
  type SendMessageInput,
  type ShoppingItemMessageMeta,
} from '@homi/shared';
import { Prisma, type Db, type PrismaClient, type Tx } from '../../db';
import { AppError } from '../../lib/http-errors';
import { optionalQuantityToString } from '../../lib/money';
import type { KeyedRateLimiter } from '../../lib/rate-limit';

/*
 * Chat domain logic shared by the HTTP routes and the Socket.IO handlers (§5 "Chat", §6).
 * Every function expects the caller's access to be verified first (see `requireConversation*`),
 * and every query is additionally scoped by conversation/household id.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres BIGINT upper bound – cursors beyond it are clamped instead of failing the query. */
const MAX_SEQ = 9_223_372_036_854_775_807n;

/** Shown for DIRECT chats whose partner has deleted their account. */
export const FORMER_MEMBER_NAME = 'Ehemaliges Mitglied';

const CONVERSATION_NOT_FOUND = 'Dieser Chat wurde nicht gefunden.';

export function parseSeq(value: string): bigint {
  const parsed = BigInt(value);
  return parsed > MAX_SEQ ? MAX_SEQ : parsed;
}

const messageInclude = {
  sender: { select: { id: true, displayName: true } },
} satisfies Prisma.MessageInclude;

type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

export function toMessageDto(row: MessageRow): MessageDto {
  const meta = row.kind === 'SHOPPING_ITEM' ? ShoppingItemMessageMetaSchema.safeParse(row.meta) : null;
  return {
    id: row.id,
    seq: row.seq.toString(),
    conversationId: row.conversationId,
    sender: row.sender ? { id: row.sender.id, displayName: row.sender.displayName } : null,
    kind: row.kind,
    content: row.content,
    meta: meta?.success ? meta.data : null,
    createdAt: row.createdAt.toISOString(),
    clientId: row.clientId,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

// ---------------------------------------------------------------------------
// Locks & membership
// ---------------------------------------------------------------------------

/**
 * `FOR KEY SHARE` on the household row. It conflicts only with the `FOR UPDATE` lock that every
 * membership change holds (households/service.ts `lockHousehold`: leave/remove, role change,
 * invitations, deletion), so a chat write and a member removal are serialised – the write either
 * completes before the removal (which then deletes the new conversation membership) or sees the
 * member gone. Chat writes never block each other or household renames.
 * Returns `false` when the household does not exist (any more).
 */
async function lockHouseholdForChat(tx: Tx, householdId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"::text AS "id" FROM "Household" WHERE "id" = ${householdId}::uuid FOR KEY SHARE`;
  return rows.length > 0;
}

/**
 * `FOR NO KEY UPDATE` on the conversation row: sends to one conversation are serialised, so a
 * message draws its `seq` and commits before the next one does (commit order = `seq` order; read
 * cursors and `?after=` never skip a message that becomes visible later). Foreign-key inserts
 * (`FOR KEY SHARE`) are not blocked by it.
 */
async function lockConversation(tx: Tx, conversationId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"::text AS "id" FROM "Conversation" WHERE "id" = ${conversationId}::uuid FOR NO KEY UPDATE`;
  return rows.length > 0;
}

/**
 * Conversation members that still belong to the conversation's household. Leaving/removal deletes
 * the conversation memberships as well; this filter is defence in depth, so a stale row can never
 * receive `chat:*` events, read cursors or appear as a participant.
 */
function inHousehold(householdId: string) {
  return { user: { memberships: { some: { householdId } } } } satisfies Prisma.ConversationMemberWhereInput;
}

async function currentMemberIds(db: Db, conversationId: string, householdId: string): Promise<string[]> {
  const members = await db.conversationMember.findMany({
    where: { conversationId, ...inHousehold(householdId) },
    select: { userId: true },
  });
  return members.map((member) => member.userId);
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

export interface ConversationAccess {
  conversationId: string;
  householdId: string;
  type: ConversationType;
  /** Current conversation members who are household members (recipients of `chat:*` events). */
  memberIds: string[];
}

/**
 * HTTP: the conversation must belong to `householdId` (already membership-checked by
 * `requireMember`) and the caller must be one of its members. Anything else → 404.
 */
export async function requireConversationInHousehold(
  db: Db,
  householdId: string,
  conversationId: string,
  userId: string,
): Promise<ConversationAccess> {
  if (!UUID.test(conversationId)) throw new AppError('NOT_FOUND', CONVERSATION_NOT_FOUND);
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, householdId, members: { some: { userId } } },
    select: {
      id: true,
      householdId: true,
      type: true,
      members: { where: inHousehold(householdId), select: { userId: true } },
    },
  });
  if (!conversation) throw new AppError('NOT_FOUND', CONVERSATION_NOT_FOUND);
  return {
    conversationId: conversation.id,
    householdId: conversation.householdId,
    type: conversation.type,
    memberIds: conversation.members.map((member) => member.userId),
  };
}

/**
 * Socket events only carry the conversation id: the caller must be a member of the
 * conversation **and** of its household (defence in depth against stale memberships).
 */
export async function requireConversationForUser(
  db: Db,
  conversationId: string,
  userId: string,
): Promise<ConversationAccess> {
  if (!UUID.test(conversationId)) throw new AppError('NOT_FOUND', CONVERSATION_NOT_FOUND);
  const conversation = await db.conversation.findFirst({
    where: {
      id: conversationId,
      members: { some: { userId } },
      household: { members: { some: { userId } } },
    },
    select: { id: true, householdId: true, type: true },
  });
  if (!conversation) throw new AppError('NOT_FOUND', CONVERSATION_NOT_FOUND);
  return {
    conversationId: conversation.id,
    householdId: conversation.householdId,
    type: conversation.type,
    memberIds: await currentMemberIds(db, conversation.id, conversation.householdId),
  };
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

/*
 * History from before a member (re-)joined a conversation – the household chat when an invitation
 * is accepted, a direct chat after leaving and re-joining the household – is never "unread": the
 * membership row starts with `lastReadSeq = 0`, so unread counts only include messages created at
 * or after `joinedAt`, and the read cursors handed to clients are raised to the newest message
 * created before `joinedAt` (the "effective" cursor). Membership changes and chat writes are
 * serialised by the household lock, so `createdAt`/`joinedAt` order matches the commit order.
 */

async function unreadCounts(db: Db, householdId: string, userId: string): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<Array<{ conversationId: string; count: number }>>`
    SELECT m."conversationId"::text AS "conversationId", COUNT(*)::int AS "count"
    FROM "Message" m
    JOIN "Conversation" c ON c."id" = m."conversationId"
    JOIN "ConversationMember" cm ON cm."conversationId" = m."conversationId" AND cm."userId" = ${userId}::uuid
    WHERE c."householdId" = ${householdId}::uuid
      AND m."seq" > cm."lastReadSeq"
      AND m."createdAt" >= cm."joinedAt"
      AND m."senderId" IS DISTINCT FROM ${userId}::uuid
    GROUP BY m."conversationId"
  `;
  return new Map(rows.map((row) => [row.conversationId, Number(row.count)]));
}

/**
 * Read cursors of the conversation's current members (household members only), oldest member
 * first. Each cursor is the stored `lastReadSeq` raised to the newest message created before the
 * member joined; the subquery only scans messages after the stored cursor (index on
 * `(conversationId, seq)`), i.e. the member's unread tail.
 */
async function memberReadStates(
  db: Db,
  conversationId: string,
  householdId: string,
): Promise<Array<{ userId: string; lastReadSeq: bigint }>> {
  return db.$queryRaw<Array<{ userId: string; lastReadSeq: bigint }>>`
    SELECT cm."userId"::text AS "userId",
      GREATEST(cm."lastReadSeq", COALESCE((
        SELECT m."seq" FROM "Message" m
        WHERE m."conversationId" = cm."conversationId"
          AND m."seq" > cm."lastReadSeq"
          AND m."createdAt" < cm."joinedAt"
        ORDER BY m."seq" DESC
        LIMIT 1
      ), 0)) AS "lastReadSeq"
    FROM "ConversationMember" cm
    WHERE cm."conversationId" = ${conversationId}::uuid
      AND EXISTS (
        SELECT 1 FROM "HouseholdMember" hm
        WHERE hm."householdId" = ${householdId}::uuid AND hm."userId" = cm."userId"
      )
    ORDER BY cm."joinedAt" ASC, cm."userId" ASC
  `;
}

/** The other participant of a DIRECT conversation, from its `directKey` ("<hid>:<a>:<b>"). */
function directPartnerId(directKey: string | null, userId: string): string | null {
  if (!directKey) return null;
  const [, first, second] = directKey.split(':');
  if (!first || !second) return null;
  return first === userId.toLowerCase() ? second : first;
}

/**
 * Conversations of `householdId` the user is a member of (optionally a single one), newest
 * activity first; conversations without messages last (household chat before direct chats).
 */
export async function listConversations(
  db: Db,
  householdId: string,
  userId: string,
  onlyConversationId?: string,
): Promise<ConversationDto[]> {
  const [household, conversations, unread] = await Promise.all([
    db.household.findUnique({ where: { id: householdId }, select: { name: true } }),
    db.conversation.findMany({
      where: {
        householdId,
        members: { some: { userId } },
        ...(onlyConversationId ? { id: onlyConversationId } : {}),
      },
      select: {
        id: true,
        type: true,
        directKey: true,
        lastMessageAt: true,
        createdAt: true,
        updatedAt: true,
        members: {
          where: inHousehold(householdId),
          select: { userId: true, user: { select: { displayName: true } } },
          orderBy: { joinedAt: 'asc' },
        },
        messages: { orderBy: { seq: 'desc' }, take: 1, include: messageInclude },
      },
    }),
    unreadCounts(db, householdId, userId),
  ]);
  if (!household) return [];

  // Partners who left the household are no longer conversation members: resolve their names.
  const missingPartners = new Set<string>();
  for (const conversation of conversations) {
    if (conversation.type !== 'DIRECT') continue;
    const partnerId = directPartnerId(conversation.directKey, userId);
    if (partnerId && !conversation.members.some((member) => member.userId === partnerId)) {
      missingPartners.add(partnerId);
    }
  }
  const formerMembers =
    missingPartners.size > 0
      ? await db.user.findMany({ where: { id: { in: [...missingPartners] } }, select: { id: true, displayName: true } })
      : [];
  const formerNames = new Map(formerMembers.map((user) => [user.id, user.displayName]));

  const dtos = conversations.map((conversation) => {
    const members = conversation.members.map((member) => ({
      userId: member.userId,
      displayName: member.user.displayName,
    }));
    let title = household.name;
    if (conversation.type === 'DIRECT') {
      const partnerId = directPartnerId(conversation.directKey, userId);
      const partner = members.find((member) => member.userId === partnerId);
      title = partner?.displayName ?? (partnerId ? formerNames.get(partnerId) : undefined) ?? FORMER_MEMBER_NAME;
    }
    const last = conversation.messages[0];
    const dto: ConversationDto = {
      id: conversation.id,
      type: conversation.type,
      title,
      members,
      lastMessage: last ? toMessageDto(last) : null,
      unreadCount: unread.get(conversation.id) ?? 0,
      updatedAt: (conversation.lastMessageAt ?? conversation.createdAt).toISOString(),
    };
    return { dto, sortAt: conversation.lastMessageAt?.getTime() ?? null, createdAt: conversation.createdAt.getTime() };
  });

  dtos.sort((a, b) => {
    if (a.sortAt !== null && b.sortAt !== null && a.sortAt !== b.sortAt) return b.sortAt - a.sortAt;
    if (a.sortAt === null && b.sortAt !== null) return 1;
    if (a.sortAt !== null && b.sortAt === null) return -1;
    if (a.dto.type !== b.dto.type) return a.dto.type === 'HOUSEHOLD' ? -1 : 1;
    return b.createdAt - a.createdAt;
  });
  return dtos.map((entry) => entry.dto);
}

/**
 * Get-or-create the DIRECT conversation between the caller and `otherUserId` (unique
 * `directKey`). Re-adds participants who left and re-joined the household.
 *
 * Runs in one transaction under the household lock (see `lockHouseholdForChat`) and re-checks
 * **both** household memberships inside it: a concurrent leave/removal either happens first (→ 404)
 * or waits and then also deletes the conversation membership created here – an ex-member can never
 * be (re-)added to a direct chat. Concurrent get-or-creates of the same pair use
 * `INSERT … ON CONFLICT DO NOTHING` and end up with the same row.
 */
export async function getOrCreateDirectConversation(
  db: PrismaClient,
  householdId: string,
  userId: string,
  otherUserId: string,
): Promise<{ conversation: ConversationDto; created: boolean }> {
  const otherId = otherUserId.toLowerCase();
  if (otherId === userId.toLowerCase()) {
    throw new AppError('BAD_REQUEST', 'Du kannst keinen Chat mit dir selbst beginnen.');
  }
  const directKey = directConversationKey(householdId, userId, otherId);

  const { conversationId, created } = await db.$transaction(async (tx) => {
    if (!(await lockHouseholdForChat(tx, householdId))) throw new AppError('NOT_FOUND');
    const memberships = await tx.householdMember.findMany({
      where: { householdId, userId: { in: [userId, otherId] } },
      select: { userId: true },
    });
    const isMember = (id: string) => memberships.some((membership) => membership.userId.toLowerCase() === id);
    if (!isMember(userId.toLowerCase())) throw new AppError('NOT_FOUND');
    if (!isMember(otherId)) throw new AppError('NOT_FOUND', 'Dieses Mitglied wurde nicht gefunden.');

    const inserted = await tx.conversation.createMany({
      data: [{ householdId, type: 'DIRECT', directKey }],
      skipDuplicates: true,
    });
    const conversation = await tx.conversation.findUnique({ where: { directKey }, select: { id: true } });
    if (!conversation || !(await lockConversation(tx, conversation.id))) {
      throw new AppError('NOT_FOUND', CONVERSATION_NOT_FOUND);
    }
    // A participant who is (re-)added starts at the newest message: the history from before
    // they re-joined is not unread. The conversation lock orders this with concurrent sends.
    const newest = await tx.message.findFirst({
      where: { conversationId: conversation.id },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    const lastReadSeq = newest?.seq ?? 0n;
    await tx.conversationMember.createMany({
      data: [
        { conversationId: conversation.id, userId, lastReadSeq },
        { conversationId: conversation.id, userId: otherId, lastReadSeq },
      ],
      skipDuplicates: true,
    });
    return { conversationId: conversation.id, created: inserted.count > 0 };
  });

  const [dto] = await listConversations(db, householdId, userId, conversationId);
  if (!dto) throw new AppError('NOT_FOUND', CONVERSATION_NOT_FOUND);
  return { conversation: dto, created };
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** One page of history in ascending `seq` order plus every (current) member's read cursor. */
export async function listMessages(
  db: Db,
  access: Pick<ConversationAccess, 'conversationId' | 'householdId'>,
  params: MessageListParams,
): Promise<MessagePage> {
  const { conversationId, householdId } = access;
  const { before, after, limit } = params;
  let rows: MessageRow[];
  let hasMore: boolean;
  if (after !== undefined) {
    const found = await db.message.findMany({
      where: { conversationId, seq: { gt: parseSeq(after) } },
      orderBy: { seq: 'asc' },
      take: limit + 1,
      include: messageInclude,
    });
    hasMore = found.length > limit;
    rows = found.slice(0, limit);
  } else {
    const found = await db.message.findMany({
      where: { conversationId, ...(before !== undefined ? { seq: { lt: parseSeq(before) } } : {}) },
      orderBy: { seq: 'desc' },
      take: limit + 1,
      include: messageInclude,
    });
    hasMore = found.length > limit;
    rows = found.slice(0, limit).reverse();
  }
  const members = await memberReadStates(db, conversationId, householdId);
  return {
    messages: rows.map(toMessageDto),
    hasMore,
    members: members.map((member) => ({ userId: member.userId, lastReadSeq: String(member.lastReadSeq) })),
  };
}

export interface ChatLimiters {
  /** New messages per user (20 / 10 s, HTTP + socket share it). */
  send: KeyedRateLimiter;
  /**
   * All send attempts per user incl. idempotent retries, invalid and unauthorised ones – consumed
   * before any database work (`consumeSendAttempt`).
   */
  attempts: KeyedRateLimiter;
  /** Read-cursor updates per user (HTTP + socket), consumed before any database work. */
  reads: KeyedRateLimiter;
}

export interface SendMessageResult {
  message: MessageDto;
  /** `false` for an idempotent retry that returned the stored message. */
  created: boolean;
  /** The sender's read cursor moved to the new message (emit `chat:read`). */
  readAdvanced: boolean;
  /** Members at commit time (household members only) – the recipients of `chat:message`. */
  recipientIds: string[];
}

function rateLimited(limiter: KeyedRateLimiter, key: string, message: string): AppError {
  return new AppError('RATE_LIMITED', message, {
    details: { retryAfterSeconds: Math.max(1, Math.ceil(limiter.retryAfterMs(key) / 1000)) },
  });
}

const SEND_RATE_LIMITED = 'Du sendest zu viele Nachrichten. Bitte warte einen Moment.';

/** Cheap per-user guard in front of every send (HTTP + socket), before any database access. */
export function consumeSendAttempt(limiters: Pick<ChatLimiters, 'attempts'>, userId: string): void {
  const key = `chat-send-attempt:${userId}`;
  if (!limiters.attempts.consume(key)) throw rateLimited(limiters.attempts, key, SEND_RATE_LIMITED);
}

/** Cheap per-user guard in front of every read-cursor update (HTTP + socket). */
export function consumeReadAttempt(limiters: Pick<ChatLimiters, 'reads'>, userId: string): void {
  const key = `chat-read:${userId}`;
  if (!limiters.reads.consume(key)) {
    throw rateLimited(limiters.reads, key, 'Zu viele Anfragen. Bitte warte einen Moment.');
  }
}

async function findByClientId(db: Db, conversationId: string, senderId: string, clientId: string) {
  return db.message.findFirst({ where: { conversationId, senderId, clientId }, include: messageInclude });
}

async function snapshotShoppingItem(
  db: Db,
  householdId: string,
  shoppingItemId: string,
): Promise<ShoppingItemMessageMeta> {
  const item = await db.shoppingItem.findFirst({
    where: { id: shoppingItemId, householdId },
    select: { id: true, name: true, quantity: true, unit: true },
  });
  if (!item) {
    const message = 'Der Einkaufsartikel wurde nicht gefunden.';
    throw new AppError('VALIDATION', undefined, {
      details: { fieldErrors: { 'meta.shoppingItemId': message }, formErrors: [] },
    });
  }
  return {
    shoppingItemId: item.id,
    name: item.name,
    quantity: optionalQuantityToString(item.quantity),
    unit: item.unit,
  };
}

/**
 * Stores a message idempotently on `(conversationId, senderId, clientId)`: a retry with the same
 * `clientId` returns the stored message (`created: false`) and is not rate-limited or re-emitted.
 * `SHOPPING_ITEM` messages reference a shopping item of the same household; its name/quantity/
 * unit are snapshotted into `meta` and the canonical title becomes the `content`.
 * Moves `Conversation.lastMessageAt` and the sender's read cursor forward.
 *
 * The write runs under the household lock (serialised with leave/removal; the sender's membership
 * and the recipients are re-read inside it) and the conversation lock (commit order = `seq` order).
 * Callers consume the per-user attempt limit (`consumeSendAttempt`) before the access check.
 */
export async function sendMessage(
  db: PrismaClient,
  access: ConversationAccess,
  senderId: string,
  input: SendMessageInput,
  limiters: Pick<ChatLimiters, 'send'>,
): Promise<SendMessageResult> {
  const { conversationId, householdId } = access;
  const existing = await findByClientId(db, conversationId, senderId, input.clientId);
  if (existing) return { message: toMessageDto(existing), created: false, readAdvanced: false, recipientIds: [] };

  const sendKey = `chat-send:${senderId}`;
  if (!limiters.send.consume(sendKey)) throw rateLimited(limiters.send, sendKey, SEND_RATE_LIMITED);

  let content = input.content;
  let meta: ShoppingItemMessageMeta | null = null;
  if (input.kind === 'SHOPPING_ITEM') {
    if (!input.meta) throw new AppError('VALIDATION', 'Angaben zum Einkaufsartikel fehlen.');
    meta = await snapshotShoppingItem(db, householdId, input.meta.shoppingItemId);
    content = shoppingItemMessageTitle(meta);
  }

  try {
    const result = await db.$transaction(async (tx) => {
      if (!(await lockHouseholdForChat(tx, householdId)) || !(await lockConversation(tx, conversationId))) {
        throw new AppError('NOT_FOUND', CONVERSATION_NOT_FOUND);
      }
      const recipientIds = await currentMemberIds(tx, conversationId, householdId);
      if (!recipientIds.includes(senderId)) throw new AppError('NOT_FOUND', CONVERSATION_NOT_FOUND);
      // A concurrent delivery of the same clientId committed while we waited for the lock.
      const stored = await findByClientId(tx, conversationId, senderId, input.clientId);
      if (stored) return { row: stored, created: false, readAdvanced: false, recipientIds };

      const created = await tx.message.create({
        data: {
          conversationId,
          senderId,
          clientId: input.clientId,
          kind: input.kind,
          content,
          ...(meta ? { meta } : {}),
        },
        include: messageInclude,
      });
      await tx.conversation.updateMany({
        where: {
          id: conversationId,
          OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: created.createdAt } }],
        },
        data: { lastMessageAt: created.createdAt },
      });
      const cursor = await tx.conversationMember.updateMany({
        where: { conversationId, userId: senderId, lastReadSeq: { lt: created.seq } },
        data: { lastReadSeq: created.seq },
      });
      return { row: created, created: true, readAdvanced: cursor.count > 0, recipientIds };
    });
    return {
      message: toMessageDto(result.row),
      created: result.created,
      readAdvanced: result.readAdvanced,
      recipientIds: result.recipientIds,
    };
  } catch (error) {
    // Two concurrent deliveries of the same clientId: the loser returns the winner's row.
    if (!isUniqueViolation(error)) throw error;
    const winner = await findByClientId(db, conversationId, senderId, input.clientId);
    if (!winner) throw error;
    return { message: toMessageDto(winner), created: false, readAdvanced: false, recipientIds: [] };
  }
}

export interface MarkReadResult {
  /** The caller's (possibly unchanged) stored cursor. */
  seq: string;
  /** The cursor moved forward (emit `chat:read`). */
  advanced: boolean;
  /** Members at commit time (household members only) – the recipients of `chat:read`. */
  recipientIds: string[];
}

/**
 * Moves the caller's read cursor forward (never backwards). The cursor is clamped to the newest
 * message of the conversation, so a forged huge `seq` cannot pre-read future messages.
 *
 * Runs under the household lock like `sendMessage`: the caller's membership and the recipients
 * are re-read inside it, so a member removed meanwhile neither moves a cursor nor receives the
 * `chat:read` event. Callers consume the per-user read limit (`consumeReadAttempt`) first.
 */
export async function markRead(
  db: PrismaClient,
  access: Pick<ConversationAccess, 'conversationId' | 'householdId'>,
  userId: string,
  seq: string,
): Promise<MarkReadResult> {
  const { conversationId, householdId } = access;
  const requested = parseSeq(seq);
  return db.$transaction(async (tx) => {
    if (!(await lockHouseholdForChat(tx, householdId))) throw new AppError('NOT_FOUND', CONVERSATION_NOT_FOUND);
    const recipientIds = await currentMemberIds(tx, conversationId, householdId);
    if (!recipientIds.includes(userId)) throw new AppError('NOT_FOUND', CONVERSATION_NOT_FOUND);
    const latest = await tx.message.findFirst({
      where: { conversationId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    const target = latest ? (requested < latest.seq ? requested : latest.seq) : 0n;
    const result = await tx.conversationMember.updateMany({
      where: { conversationId, userId, lastReadSeq: { lt: target } },
      data: { lastReadSeq: target },
    });
    const member = await tx.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { lastReadSeq: true },
    });
    return { seq: (member?.lastReadSeq ?? 0n).toString(), advanced: result.count > 0, recipientIds };
  });
}
