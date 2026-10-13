import { queryOptions } from '@tanstack/react-query';
import type {
  ClearCompletedRequest,
  ClearCompletedResponse,
  CreateShoppingItemRequest,
  ShoppingItemDto,
  ShoppingListResponse,
  UpdateShoppingItemRequest,
} from '@homi/shared';
import { api } from './client';
import { queryKeys } from './queryKeys';

/*
 * Shopping list (ARCHITECTURE §5 "Shopping"). Quantities and prices travel as decimal strings
 * ("1.5", "2.40") – never as JS numbers. The server answers 404 for households the user is not a
 * member of.
 */

const shoppingPath = (householdId: string) => `/api/households/${encodeURIComponent(householdId)}/shopping`;
const itemPath = (householdId: string, itemId: string) =>
  `${shoppingPath(householdId)}/items/${encodeURIComponent(itemId)}`;

export function fetchShoppingList(householdId: string, signal?: AbortSignal): Promise<ShoppingListResponse> {
  return api.get<ShoppingListResponse>(shoppingPath(householdId), { signal });
}

/**
 * Pass a random `clientId` for optimistic rows: the item is stored under
 * `shoppingItemIdFor(householdId, clientId)`; re-sending the same `clientId` is idempotent (200).
 */
export function createShoppingItem(householdId: string, body: CreateShoppingItemRequest): Promise<ShoppingItemDto> {
  return api.post<ShoppingItemDto>(`${shoppingPath(householdId)}/items`, body);
}

/** Partial update; `completed` toggles are idempotent on the server. */
export function updateShoppingItem(
  householdId: string,
  itemId: string,
  body: UpdateShoppingItemRequest,
): Promise<ShoppingItemDto> {
  return api.patch<ShoppingItemDto>(itemPath(householdId, itemId), body);
}

export function deleteShoppingItem(householdId: string, itemId: string): Promise<void> {
  return api.delete(itemPath(householdId, itemId));
}

/**
 * Deletes the completed items the user confirmed (`itemIds`); items another member ticks off in
 * the meantime stay. Completed items hidden by the 24-hour rule are purged by the server too.
 */
export function clearCompletedShoppingItems(
  householdId: string,
  itemIds: readonly string[],
): Promise<ClearCompletedResponse> {
  const body: ClearCompletedRequest = { itemIds: [...itemIds] };
  return api.post<ClearCompletedResponse>(`${shoppingPath(householdId)}/clear-completed`, body);
}

/** `['shopping', hid]` – invalidated by realtime `sync` events with scope `shopping`. */
export function shoppingListQueryOptions(householdId: string) {
  return queryOptions({
    queryKey: queryKeys.shopping(householdId),
    queryFn: ({ signal }) => fetchShoppingList(householdId, signal),
  });
}
