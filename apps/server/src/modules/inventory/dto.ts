import { imageUrl, type InventoryItemDto, type ItemImageDto } from '@homi/shared';
import type { Prisma } from '../../db';
import { optionalMoneyToString, quantityToString, totalValueToString } from '../../lib/money';

/**
 * Inventory item DTO mapping (§5 "Inventory"). Reused by other modules (e.g. the dashboard's
 * `recentItems`): query with `select: inventoryItemSelect` and map with `toInventoryItemDto`.
 *
 *   const rows = await prisma.inventoryItem.findMany({ where: { householdId }, select: inventoryItemSelect });
 *   const items = rows.map(toInventoryItemDto);
 */
export const inventoryItemSelect = {
  id: true,
  householdId: true,
  name: true,
  category: true,
  quantity: true,
  unit: true,
  unitPrice: true,
  imageId: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, displayName: true } },
} as const satisfies Prisma.InventoryItemSelect;

export type InventoryItemRow = Prisma.InventoryItemGetPayload<{ select: typeof inventoryItemSelect }>;

/** `{ id, thumbUrl, fullUrl }` of an image (URLs are served after a membership check). */
export function toItemImageDto(householdId: string, imageId: string): ItemImageDto {
  return {
    id: imageId,
    thumbUrl: imageUrl(householdId, imageId, 'thumb'),
    fullUrl: imageUrl(householdId, imageId, 'full'),
  };
}

export function toInventoryItemDto(row: InventoryItemRow): InventoryItemDto {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    quantity: quantityToString(row.quantity),
    unit: row.unit,
    unitPrice: optionalMoneyToString(row.unitPrice),
    totalValue: totalValueToString(row.quantity, row.unitPrice),
    image: row.imageId ? toItemImageDto(row.householdId, row.imageId) : null,
    createdBy: row.createdBy ? { id: row.createdBy.id, displayName: row.createdBy.displayName } : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}
