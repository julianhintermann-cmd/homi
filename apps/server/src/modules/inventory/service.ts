import {
  LIMITS,
  type CreateItemInput,
  type InventoryItemDto,
  type UpdateItemInput,
  type ValidationErrorDetails,
} from '@homi/shared';
import { Prisma, type PrismaClient, type Tx } from '../../db';
import { AppError } from '../../lib/http-errors';
import { recordActivity } from '../activity/service';
import { inventoryItemSelect, toInventoryItemDto, type InventoryItemRow } from './dto';
import { assertAttachableImage } from './images';

/*
 * Inventory writes (§5). Every write runs in one transaction together with its activity row
 * (value deltas in CHF, computed with Prisma Decimal); callers emit realtime events and delete
 * image files only after the transaction has committed.
 */

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

const ZERO = new Decimal(0);
const MAX_QUANTITY = new Decimal(LIMITS.quantity.max);

export interface InventoryActor {
  householdId: string;
  userId: string;
}

/** quantity × unitPrice rounded half away from zero to CHF 0.01; `null` when the price is unknown. */
export function itemValue(quantity: Decimal | string, unitPrice: Decimal | string | null): Decimal | null {
  if (unitPrice === null) return null;
  return new Decimal(quantity).mul(unitPrice).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Change of the inventory value; `null` when neither state has a known value. */
export function valueChange(before: Decimal | null, after: Decimal | null): Decimal | null {
  if (before === null && after === null) return null;
  return (after ?? ZERO).minus(before ?? ZERO);
}

function itemNotFound(): AppError {
  return new AppError('NOT_FOUND', 'Dieser Artikel existiert nicht mehr.');
}

function versionConflict(currentVersion?: number): AppError {
  return new AppError('VERSION_CONFLICT', undefined, {
    details: currentVersion === undefined ? undefined : { currentVersion },
  });
}

function fieldError(field: string, message: string): AppError {
  const details: ValidationErrorDetails = { fieldErrors: { [field]: message }, formErrors: [] };
  return new AppError('VALIDATION', message, { details });
}

/** Maps the unique violation on `InventoryItem.imageId` (two items racing for one upload). */
function mapImageConflict(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    JSON.stringify(error.meta ?? {}).includes('imageId')
  ) {
    throw new AppError('IMAGE_IN_USE');
  }
  throw error;
}

async function findItem(tx: Tx, actor: InventoryActor, itemId: string): Promise<InventoryItemRow | null> {
  return tx.inventoryItem.findFirst({
    where: { id: itemId, householdId: actor.householdId },
    select: inventoryItemSelect,
  });
}

export async function getItem(prisma: PrismaClient, actor: InventoryActor, itemId: string): Promise<InventoryItemDto> {
  const row = await prisma.inventoryItem.findFirst({
    where: { id: itemId, householdId: actor.householdId },
    select: inventoryItemSelect,
  });
  if (!row) throw itemNotFound();
  return toInventoryItemDto(row);
}

export async function createItem(
  prisma: PrismaClient,
  actor: InventoryActor,
  input: CreateItemInput,
): Promise<InventoryItemDto> {
  return prisma
    .$transaction(async (tx) => {
      if (input.imageId) {
        await assertAttachableImage(tx, {
          householdId: actor.householdId,
          userId: actor.userId,
          imageId: input.imageId,
        });
      }
      const created = await tx.inventoryItem.create({
        data: {
          householdId: actor.householdId,
          name: input.name,
          category: input.category,
          quantity: input.quantity,
          unit: input.unit,
          unitPrice: input.unitPrice,
          imageId: input.imageId,
          createdById: actor.userId,
        },
        select: inventoryItemSelect,
      });
      await recordActivity(tx, {
        householdId: actor.householdId,
        actorId: actor.userId,
        type: 'ITEM_CREATED',
        entityType: 'item',
        entityId: created.id,
        meta: { name: created.name },
        valueDelta: itemValue(created.quantity, created.unitPrice),
      });
      return toInventoryItemDto(created);
    })
    .catch(mapImageConflict);
}

export interface UpdateItemResult {
  item: InventoryItemDto;
  /** `false` when the request changed nothing (no write, no activity, no version bump). */
  changed: boolean;
  /** Storage key of an image that was replaced/removed – delete its files after the commit. */
  removedImageKey: string | null;
}

function sameDecimal(a: Decimal | null, b: string | null): boolean {
  if (a === null || b === null) return a === null && b === null;
  return a.eq(b);
}

/** Partial update with optimistic concurrency: only provided (and actually different) fields change. */
export async function updateItem(
  prisma: PrismaClient,
  actor: InventoryActor,
  itemId: string,
  input: UpdateItemInput,
): Promise<UpdateItemResult> {
  return prisma
    .$transaction(async (tx) => {
      const existing = await findItem(tx, actor, itemId);
      if (!existing) throw itemNotFound();
      if (existing.version !== input.version) throw versionConflict(existing.version);

      const data: Prisma.InventoryItemUncheckedUpdateManyInput = {};
      if (input.name !== undefined && input.name !== existing.name) data.name = input.name;
      if (input.category !== undefined && input.category !== existing.category) data.category = input.category;
      if (input.unit !== undefined && input.unit !== existing.unit) data.unit = input.unit;
      if (input.quantity !== undefined && !existing.quantity.eq(input.quantity)) data.quantity = input.quantity;
      if (input.unitPrice !== undefined && !sameDecimal(existing.unitPrice, input.unitPrice)) {
        data.unitPrice = input.unitPrice;
      }
      let replacedImageId: string | null = null;
      if (input.imageId !== undefined && input.imageId !== existing.imageId) {
        if (input.imageId) {
          await assertAttachableImage(tx, {
            householdId: actor.householdId,
            userId: actor.userId,
            imageId: input.imageId,
            currentItemId: itemId,
          });
        }
        data.imageId = input.imageId;
        replacedImageId = existing.imageId;
      }

      if (Object.keys(data).length === 0) {
        return { item: toInventoryItemDto(existing), changed: false, removedImageKey: null };
      }

      // The version predicate makes the check-and-write atomic against concurrent writers.
      const written = await tx.inventoryItem.updateMany({
        where: { id: itemId, householdId: actor.householdId, version: input.version },
        data: { ...data, version: { increment: 1 } },
      });
      if (written.count !== 1) throw versionConflict();

      let removedImageKey: string | null = null;
      if (replacedImageId) {
        const removed = await tx.inventoryImage.delete({
          where: { id: replacedImageId },
          select: { storageKey: true },
        });
        removedImageKey = removed.storageKey;
      }

      const updated = await findItem(tx, actor, itemId);
      if (!updated) throw itemNotFound();
      await recordActivity(tx, {
        householdId: actor.householdId,
        actorId: actor.userId,
        type: 'ITEM_UPDATED',
        entityType: 'item',
        entityId: itemId,
        meta: { name: updated.name },
        valueDelta: valueChange(
          itemValue(existing.quantity, existing.unitPrice),
          itemValue(updated.quantity, updated.unitPrice),
        ),
      });
      return { item: toInventoryItemDto(updated), changed: true, removedImageKey };
    })
    .catch(mapImageConflict);
}

export interface QuantityChangeResult {
  item: InventoryItemDto;
  /** `false` when the quantity was already at the clamp (e.g. −1 at 0). */
  changed: boolean;
}

interface LockedQuantityRow {
  quantity: Decimal;
  unitPrice: Decimal | null;
  name: string;
}

/**
 * Atomic `quantity = GREATEST(quantity + delta, 0)`. The row is locked first, so concurrent
 * taps (same or other users) serialise in the database and are never lost; the activity records
 * the actually applied change.
 */
export async function changeQuantity(
  prisma: PrismaClient,
  actor: InventoryActor,
  itemId: string,
  delta: string,
): Promise<QuantityChangeResult> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<LockedQuantityRow[]>`
      SELECT "quantity", "unitPrice", "name" FROM "InventoryItem"
      WHERE "id" = ${itemId}::uuid AND "householdId" = ${actor.householdId}::uuid
      FOR UPDATE`;
    const current = locked[0];
    if (!current) throw itemNotFound();

    // We hold the row lock, so this is exactly what the UPDATE below will compute.
    const before = new Decimal(current.quantity);
    const expected = Decimal.max(before.plus(delta), ZERO);
    if (expected.gt(MAX_QUANTITY)) throw fieldError('delta', 'Die Menge ist zu gross.');
    if (expected.eq(before)) {
      const unchanged = await findItem(tx, actor, itemId);
      if (!unchanged) throw itemNotFound();
      return { item: toInventoryItemDto(unchanged), changed: false };
    }

    await tx.$executeRaw`
      UPDATE "InventoryItem"
      SET "quantity" = GREATEST("quantity" + ${delta}::numeric, 0),
          "version" = "version" + 1,
          "updatedAt" = (now() AT TIME ZONE 'UTC')
      WHERE "id" = ${itemId}::uuid AND "householdId" = ${actor.householdId}::uuid`;

    const row = await findItem(tx, actor, itemId);
    if (!row) throw itemNotFound();
    const after = new Decimal(row.quantity);
    const unitPrice = current.unitPrice === null ? null : new Decimal(current.unitPrice);
    await recordActivity(tx, {
      householdId: actor.householdId,
      actorId: actor.userId,
      type: 'ITEM_QUANTITY_CHANGED',
      entityType: 'item',
      entityId: itemId,
      meta: {
        name: current.name,
        quantityBefore: before.toFixed(),
        quantityAfter: after.toFixed(),
        delta: after.minus(before).toFixed(),
      },
      valueDelta: valueChange(itemValue(before, unitPrice), itemValue(after, unitPrice)),
    });
    return { item: toInventoryItemDto(row), changed: true };
  });
}

export interface DeleteItemResult {
  /** Storage key of the item's image – delete its files after the commit. */
  removedImageKey: string | null;
}

export async function deleteItem(
  prisma: PrismaClient,
  actor: InventoryActor,
  itemId: string,
): Promise<DeleteItemResult> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.inventoryItem.findFirst({
      where: { id: itemId, householdId: actor.householdId },
      select: { id: true, name: true, quantity: true, unitPrice: true, imageId: true },
    });
    if (!existing) throw itemNotFound();

    const deleted = await tx.inventoryItem.deleteMany({ where: { id: itemId, householdId: actor.householdId } });
    if (deleted.count !== 1) throw itemNotFound();

    let removedImageKey: string | null = null;
    if (existing.imageId) {
      const image = await tx.inventoryImage.delete({ where: { id: existing.imageId }, select: { storageKey: true } });
      removedImageKey = image.storageKey;
    }

    const value = itemValue(existing.quantity, existing.unitPrice);
    await recordActivity(tx, {
      householdId: actor.householdId,
      actorId: actor.userId,
      type: 'ITEM_DELETED',
      entityType: 'item',
      entityId: itemId,
      meta: { name: existing.name },
      valueDelta: value === null ? null : value.negated(),
    });
    return { removedImageKey };
  });
}
