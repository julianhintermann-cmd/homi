import type { ShoppingItemDto } from '@homi/shared';
import type { Prisma } from '../../db';
import { optionalMoneyToString, optionalQuantityToString } from '../../lib/money';

/*
 * ShoppingItem row → `ShoppingItemDto` (`@homi/shared` ShoppingItemDtoSchema). Reusable by other
 * modules (dashboard "Einkaufsliste" preview, chat shopping cards): select with
 * `shoppingItemDtoSelect` and map with `toShoppingItemDto`. Decimals stay strings – never floats.
 */

const userRefSelect = { select: { id: true, displayName: true } } as const;

export const shoppingItemDtoSelect = {
  id: true,
  name: true,
  quantity: true,
  unit: true,
  unitPrice: true,
  completed: true,
  completedAt: true,
  completedBy: userRefSelect,
  sourceItemId: true,
  createdBy: userRefSelect,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ShoppingItemSelect;

export type ShoppingItemRow = Prisma.ShoppingItemGetPayload<{ select: typeof shoppingItemDtoSelect }>;

export function toShoppingItemDto(row: ShoppingItemRow): ShoppingItemDto {
  return {
    id: row.id,
    name: row.name,
    quantity: optionalQuantityToString(row.quantity),
    unit: row.unit,
    unitPrice: optionalMoneyToString(row.unitPrice),
    completed: row.completed,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    completedBy: row.completedBy ? { id: row.completedBy.id, displayName: row.completedBy.displayName } : null,
    sourceItemId: row.sourceItemId,
    createdBy: row.createdBy ? { id: row.createdBy.id, displayName: row.createdBy.displayName } : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
