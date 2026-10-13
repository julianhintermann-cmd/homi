import type { DashboardDto, ShoppingItemDto } from '@homi/shared';
import { api } from './client';
import { updateShoppingItem } from './shopping';

/** Home aggregates (ARCHITECTURE §5 "Dashboard"). */
export function fetchDashboard(householdId: string, signal?: AbortSignal): Promise<DashboardDto> {
  return api.get<DashboardDto>(`/api/households/${encodeURIComponent(householdId)}/dashboard`, { signal });
}

/**
 * Ticks an open shopping item from the Home preview (`PATCH …/shopping/items/:id`, endpoint of the
 * shopping module). Completing never changes inventory quantities.
 */
export function setShoppingItemCompleted(
  householdId: string,
  shoppingItemId: string,
  completed: boolean,
): Promise<ShoppingItemDto> {
  return updateShoppingItem(householdId, shoppingItemId, { completed });
}
