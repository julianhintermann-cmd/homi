import { LIMITS, type DashboardDto } from '@homi/shared';
import type { Db } from '../../db';
import { moneyToString } from '../../lib/money';
import { listRecentActivity, sumValueDeltaSince } from '../activity/service';
import { inventoryItemSelect, toInventoryItemDto } from '../inventory/dto';
import { shoppingItemDtoSelect, toShoppingItemDto } from '../shopping/dto';
import { toMemberRef } from './dto';

const DAY_MS = 24 * 60 * 60 * 1000;

interface InventoryTotalsRow {
  itemCount: number;
  unpricedItemCount: number;
  /** numeric rendered as text by PostgreSQL – never converted to a JS float. */
  inventoryValue: string;
}

/**
 * Inventory totals in one SQL statement. Each line total is `ROUND(quantity × unitPrice, 2)` (the
 * same half-away-from-zero rounding as the item's `totalValue`), so the Home value is the exact sum
 * of the values shown in the inventory list. Items without a price are excluded and counted.
 */
async function inventoryTotals(db: Db, householdId: string): Promise<InventoryTotalsRow> {
  const rows = await db.$queryRaw<InventoryTotalsRow[]>`
    SELECT
      COUNT(*)::int AS "itemCount",
      COUNT(*) FILTER (WHERE "unitPrice" IS NULL)::int AS "unpricedItemCount",
      COALESCE(SUM(ROUND("quantity" * "unitPrice", 2)), 0)::text AS "inventoryValue"
    FROM "InventoryItem"
    WHERE "householdId" = ${householdId}::uuid`;
  return rows[0] ?? { itemCount: 0, unpricedItemCount: 0, inventoryValue: '0' };
}

/** Aggregates for the Home screen (§5 "Dashboard"); the caller has checked membership. */
export async function loadDashboard(db: Db, householdId: string, now: Date = new Date()): Promise<DashboardDto> {
  const since = new Date(now.getTime() - LIMITS.dashboard.weeklyWindowDays * DAY_MS);
  const [totals, weeklyValueDelta, openShoppingCount, recentItems, openShoppingItems, members, recentActivity] =
    await Promise.all([
      inventoryTotals(db, householdId),
      sumValueDeltaSince(db, householdId, since),
      db.shoppingItem.count({ where: { householdId, completed: false } }),
      db.inventoryItem.findMany({
        where: { householdId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: LIMITS.dashboard.recentItems,
        select: inventoryItemSelect,
      }),
      db.shoppingItem.findMany({
        where: { householdId, completed: false },
        // List order: oldest open entry first (what has been missing the longest).
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: LIMITS.dashboard.openShoppingItems,
        select: shoppingItemDtoSelect,
      }),
      db.householdMember.findMany({
        where: { householdId },
        orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
        select: { userId: true, user: { select: { displayName: true } } },
      }),
      listRecentActivity(db, householdId, LIMITS.dashboard.recentActivity),
    ]);

  return {
    itemCount: totals.itemCount,
    inventoryValue: moneyToString(totals.inventoryValue),
    unpricedItemCount: totals.unpricedItemCount,
    weeklyValueDelta,
    openShoppingCount,
    recentItems: recentItems.map(toInventoryItemDto),
    openShoppingItems: openShoppingItems.map(toShoppingItemDto),
    members: members.map(toMemberRef),
    recentActivity,
  };
}
