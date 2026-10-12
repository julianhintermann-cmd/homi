import { z } from 'zod';
import { ActivityDtoSchema } from './activity';
import { MemberRefSchema, MoneyStringSchema } from './common';
import { InventoryItemDtoSchema } from './inventory';
import { ShoppingItemDtoSchema } from './shopping';

/*
 * Home dashboard aggregates (§5 "Dashboard").
 */

export const DashboardDtoSchema = z.object({
  /** Number of inventory records (not summed quantities). */
  itemCount: z.number().int().nonnegative(),
  /** Σ quantity × unitPrice over priced items, 2 decimals. */
  inventoryValue: MoneyStringSchema,
  unpricedItemCount: z.number().int().nonnegative(),
  /** Σ activity.valueDelta over the last 7 days. */
  weeklyValueDelta: MoneyStringSchema,
  openShoppingCount: z.number().int().nonnegative(),
  /** Up to 3 most recently created/updated items. */
  recentItems: z.array(InventoryItemDtoSchema),
  /** Up to 3 open shopping items. */
  openShoppingItems: z.array(ShoppingItemDtoSchema),
  members: z.array(MemberRefSchema),
  /** Up to 5 latest activities. */
  recentActivity: z.array(ActivityDtoSchema),
});
export type DashboardDto = z.infer<typeof DashboardDtoSchema>;
