import {
  DEFAULT_SHOPPING_LIST_NAME,
  SHOPPING_LIMITS,
  shoppingItemIdFor,
  type CreateShoppingItemInput,
  type ShoppingItemDto,
  type ShoppingListResponse,
  type UpdateShoppingItemInput,
} from '@homi/shared';
import type { Db, Prisma, PrismaClient, Tx } from '../../db';
import { AppError } from '../../lib/http-errors';
import { recordActivity } from '../activity/service';
import { shoppingItemDtoSelect, toShoppingItemDto } from './dto';

/*
 * Shopping list business logic (§5 "Shopping"). Every query filters by `householdId` in addition
 * to the membership check of the route (tenant isolation, §4.4). Activities are written inside
 * the same transaction as the change they describe; realtime events are emitted by the routes
 * after the transaction committed. Completing an item never touches inventory quantities.
 */

export interface ShoppingActor {
  householdId: string;
  userId: string;
}

export interface ShoppingListRef {
  id: string;
  name: string;
}

const listSelect = { id: true, name: true } as const satisfies Prisma.ShoppingListSelect;

/** Completed items ticked off before this moment are no longer listed (design 03b hint). */
export function completedVisibleSince(now: Date): Date {
  return new Date(now.getTime() - SHOPPING_LIMITS.completedVisibleHours * 60 * 60 * 1000);
}

/** Items a member can see: open ones and those completed within the last 24 hours. */
function visibleItemsWhere(householdId: string, now: Date): Prisma.ShoppingItemWhereInput {
  return {
    householdId,
    OR: [{ completed: false }, { completed: true, completedAt: { gte: completedVisibleSince(now) } }],
  };
}

/**
 * Removes completed items hidden by the 24-hour rule. They are gone from every member's view (no
 * screen shows them any more), so they must neither fill the list cap nor pile up forever. Silent
 * housekeeping: no activity, no sync event (nothing visible changes).
 */
async function purgeHiddenCompleted(tx: Tx, householdId: string, now: Date): Promise<number> {
  const purged = await tx.shoppingItem.deleteMany({
    where: { householdId, completed: true, completedAt: { lt: completedVisibleSince(now) } },
  });
  return purged.count;
}

/**
 * Serialises writes that depend on the list as a whole (creating the default list, the item cap,
 * client-id idempotency) per household. Transaction-scoped and re-entrant within the transaction.
 */
async function lockHouseholdList(tx: Tx, householdId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`homi:shopping-list:${householdId}`}))`;
}

function findList(db: Db, householdId: string): Promise<ShoppingListRef | null> {
  return db.shoppingList.findFirst({
    where: { householdId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: listSelect,
  });
}

/**
 * The household's default list. Household creation always creates it (§3); should it be missing
 * anyway (e.g. data imported by hand), it is created once – serialised per household with a
 * transaction-scoped advisory lock so concurrent requests cannot create two lists.
 */
export async function ensureShoppingList(tx: Tx, householdId: string): Promise<ShoppingListRef> {
  const existing = await findList(tx, householdId);
  if (existing) return existing;
  await lockHouseholdList(tx, householdId);
  const raced = await findList(tx, householdId);
  if (raced) return raced;
  return tx.shoppingList.create({ data: { householdId, name: DEFAULT_SHOPPING_LIST_NAME }, select: listSelect });
}

/**
 * `GET /households/:householdId/shopping`: open items oldest first (Reminders style – new items
 * are appended), completed items most recently ticked off first. One query, so `open`,
 * `completed` and `stats` always describe the same snapshot.
 */
export async function getShoppingList(
  prisma: PrismaClient,
  householdId: string,
  now: Date = new Date(),
): Promise<ShoppingListResponse> {
  const list =
    (await findList(prisma, householdId)) ?? (await prisma.$transaction((tx) => ensureShoppingList(tx, householdId)));

  const rows = await prisma.shoppingItem.findMany({
    where: { ...visibleItemsWhere(householdId, now), shoppingListId: list.id },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: shoppingItemDtoSelect,
  });

  const open: ShoppingItemDto[] = [];
  const completedRows: typeof rows = [];
  for (const row of rows) {
    if (row.completed) completedRows.push(row);
    else open.push(toShoppingItemDto(row));
  }
  completedRows.sort((a, b) => {
    const byTime = (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0);
    return byTime !== 0 ? byTime : b.id.localeCompare(a.id);
  });
  const completed = completedRows.map(toShoppingItemDto);

  return {
    list: { id: list.id, name: list.name },
    open,
    completed,
    stats: { done: completed.length, total: open.length + completed.length },
  };
}

function validationError(field: string, message: string): AppError {
  return new AppError('VALIDATION', undefined, { details: { fieldErrors: { [field]: message }, formErrors: [] } });
}

export interface CreateResult {
  item: ShoppingItemDto;
  /** `false` when a retry re-sent the `clientId` of an item that already exists in this household. */
  created: boolean;
}

/**
 * `POST /households/:householdId/shopping/items`. Runs under the household's list lock, so the
 * cap check and the client-id idempotency hold under concurrency (parallel retries of one id get
 * the same item, parallel creates cannot overshoot the cap).
 */
export async function createShoppingItem(
  prisma: PrismaClient,
  actor: ShoppingActor,
  input: CreateShoppingItemInput,
  now: Date = new Date(),
): Promise<CreateResult> {
  const { householdId, userId } = actor;
  return prisma.$transaction(async (tx) => {
    await lockHouseholdList(tx, householdId);

    // The stored id is derived from (household, client id) – never the raw client value – so a
    // client id cannot collide with, take over or probe an item of another household: the answer
    // depends only on this household's own rows.
    const itemId = input.clientId ? shoppingItemIdFor(householdId, input.clientId) : undefined;
    if (itemId) {
      const existing = await tx.shoppingItem.findFirst({
        where: { id: itemId, householdId },
        select: shoppingItemDtoSelect,
      });
      if (existing) return { item: toShoppingItemDto(existing), created: false };
    }

    let name = input.name;
    let unit = input.unit;
    if (input.sourceItemId) {
      const source = await tx.inventoryItem.findFirst({
        where: { id: input.sourceItemId, householdId },
        select: { name: true, unit: true },
      });
      // Same answer for unknown ids and items of other households.
      if (!source) throw validationError('sourceItemId', 'Dieser Inventarartikel wurde nicht gefunden.');
      name ??= source.name;
      if (unit === undefined) unit = source.unit;
    }
    if (name === undefined) throw validationError('name', 'Bitte gib einen Namen ein.');

    const list = await ensureShoppingList(tx, householdId);
    await purgeHiddenCompleted(tx, householdId, now);
    const count = await tx.shoppingItem.count({
      where: { ...visibleItemsWhere(householdId, now), shoppingListId: list.id },
    });
    if (count >= SHOPPING_LIMITS.maxItems) {
      throw new AppError('CONFLICT', 'Die Einkaufsliste ist voll. Lösche zuerst erledigte Artikel.', {
        details: { reason: 'LIST_FULL', max: SHOPPING_LIMITS.maxItems },
      });
    }

    const row = await tx.shoppingItem.create({
      data: {
        ...(itemId ? { id: itemId } : {}),
        shoppingListId: list.id,
        householdId,
        name,
        quantity: input.quantity ?? null,
        unit: unit ?? null,
        unitPrice: input.unitPrice ?? null,
        sourceItemId: input.sourceItemId ?? null,
        createdById: userId,
      },
      select: shoppingItemDtoSelect,
    });
    await recordActivity(tx, {
      householdId,
      actorId: userId,
      type: 'SHOPPING_ITEM_ADDED',
      entityType: 'shoppingItem',
      entityId: row.id,
      meta: { name: row.name },
    });
    return { item: toShoppingItemDto(row), created: true };
  });
}

export interface UpdateResult {
  item: ShoppingItemDto;
  /** Something was written (fields and/or a completion state transition). */
  changed: boolean;
  /** The completion state actually flipped in this request. */
  transition: 'completed' | 'reopened' | null;
}

/**
 * `PATCH /households/:householdId/shopping/items/:shoppingItemId`. Completion is a conditional
 * update (`WHERE completed = <old>`), so it is idempotent and concurrent completions by several
 * members produce exactly one state change (one activity, `completedBy` = the first one).
 */
export async function updateShoppingItem(
  prisma: PrismaClient,
  actor: ShoppingActor,
  itemId: string,
  input: UpdateShoppingItemInput,
  now: Date = new Date(),
): Promise<UpdateResult> {
  const { householdId, userId } = actor;
  return prisma.$transaction(async (tx) => {
    const existing = await tx.shoppingItem.findFirst({ where: { id: itemId, householdId }, select: { id: true } });
    if (!existing) throw new AppError('NOT_FOUND');

    const data: Prisma.ShoppingItemUpdateManyMutationInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.quantity !== undefined) data.quantity = input.quantity;
    if (input.unit !== undefined) data.unit = input.unit;
    if (input.unitPrice !== undefined) data.unitPrice = input.unitPrice;
    const fieldsChanged = Object.keys(data).length > 0;
    if (fieldsChanged) {
      const updated = await tx.shoppingItem.updateMany({ where: { id: itemId, householdId }, data });
      if (updated.count === 0) throw new AppError('NOT_FOUND');
    }

    let transition: UpdateResult['transition'] = null;
    if (input.completed !== undefined) {
      const flipped = await tx.shoppingItem.updateMany({
        where: { id: itemId, householdId, completed: !input.completed },
        data: input.completed
          ? { completed: true, completedById: userId, completedAt: now }
          : { completed: false, completedById: null, completedAt: null },
      });
      if (flipped.count === 1) transition = input.completed ? 'completed' : 'reopened';
    }

    const row = await tx.shoppingItem.findFirst({ where: { id: itemId, householdId }, select: shoppingItemDtoSelect });
    if (!row) throw new AppError('NOT_FOUND');

    if (transition) {
      await recordActivity(tx, {
        householdId,
        actorId: userId,
        type: transition === 'completed' ? 'SHOPPING_ITEM_COMPLETED' : 'SHOPPING_ITEM_REOPENED',
        entityType: 'shoppingItem',
        entityId: row.id,
        meta: { name: row.name },
        createdAt: now,
      });
    }
    return { item: toShoppingItemDto(row), changed: fieldsChanged || transition !== null, transition };
  });
}

/** `DELETE /households/:householdId/shopping/items/:shoppingItemId` */
export async function deleteShoppingItem(prisma: PrismaClient, actor: ShoppingActor, itemId: string): Promise<void> {
  const { householdId, userId } = actor;
  await prisma.$transaction(async (tx) => {
    const existing = await tx.shoppingItem.findFirst({ where: { id: itemId, householdId }, select: { name: true } });
    if (!existing) throw new AppError('NOT_FOUND');
    const deleted = await tx.shoppingItem.deleteMany({ where: { id: itemId, householdId } });
    if (deleted.count === 0) throw new AppError('NOT_FOUND');
    await recordActivity(tx, {
      householdId,
      actorId: userId,
      type: 'SHOPPING_ITEM_DELETED',
      entityType: 'shoppingItem',
      entityId: itemId,
      meta: { name: existing.name },
    });
  });
}

/**
 * `POST /households/:householdId/shopping/clear-completed`: deletes the completed items the user
 * confirmed (`itemIds`; every completed item when omitted) and records one bulk activity. Items
 * restored meanwhile, or ticked off by another member while the confirmation was open (not in
 * `itemIds`), stay. Completed items already hidden by the 24-hour rule are purged silently.
 * Returns the number of removed visible items.
 */
export async function clearCompletedShoppingItems(
  prisma: PrismaClient,
  actor: ShoppingActor,
  itemIds?: readonly string[],
  now: Date = new Date(),
): Promise<number> {
  const { householdId, userId } = actor;
  return prisma.$transaction(async (tx) => {
    await purgeHiddenCompleted(tx, householdId, now);
    const deleted = await tx.shoppingItem.deleteMany({
      where: { householdId, completed: true, ...(itemIds ? { id: { in: [...itemIds] } } : {}) },
    });
    if (deleted.count > 0) {
      await recordActivity(tx, {
        householdId,
        actorId: userId,
        type: 'SHOPPING_ITEM_DELETED',
        entityType: 'shoppingItem',
        meta: { count: deleted.count },
      });
    }
    return deleted.count;
  });
}
