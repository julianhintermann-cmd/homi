import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  CreateItemRequest,
  InventoryItemDto,
  ItemCategory,
  ItemListResponse,
  ItemSort,
  UpdateItemRequest,
} from '@homi/shared';
import { createItem, deleteItem, fetchItem, fetchItems, updateItem } from '@/api/inventory';
import { queryKeys } from '@/api/queryKeys';
import { useRequiredHouseholdId } from '@/hooks/useActiveHousehold';

/** Page size of the inventory list (the API allows up to 100). */
export const ITEMS_PAGE_SIZE = 50;

export interface InventoryListFilters {
  /** Debounced, trimmed search term (`null` = none). */
  search: string | null;
  category: ItemCategory | null;
  sort: ItemSort;
}

export type ItemPages = InfiniteData<ItemListResponse, string | null>;

export function inventoryListKey(householdId: string, filters: InventoryListFilters) {
  return queryKeys.items(householdId, { search: filters.search, category: filters.category, sort: filters.sort });
}

/** Infinite, cursor-paginated item list. Keeps the previous result visible while a new filter loads. */
export function useInventoryList(filters: InventoryListFilters) {
  const householdId = useRequiredHouseholdId();
  return useInfiniteQuery({
    queryKey: inventoryListKey(householdId, filters),
    queryFn: ({ pageParam, signal }) =>
      fetchItems(householdId, { ...filters, cursor: pageParam, limit: ITEMS_PAGE_SIZE }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
  });
}

/** An item from any cached list page (instant details while the item itself loads). */
export function findCachedItem(client: QueryClient, householdId: string, itemId: string): InventoryItemDto | undefined {
  for (const [, data] of client.getQueriesData<ItemPages>({ queryKey: queryKeys.itemsAll(householdId) })) {
    for (const page of data?.pages ?? []) {
      const hit = page.items.find((item) => item.id === itemId);
      if (hit) return hit;
    }
  }
  return undefined;
}

export function useInventoryItem(itemId: string) {
  const householdId = useRequiredHouseholdId();
  const client = useQueryClient();
  return useQuery<InventoryItemDto>({
    queryKey: queryKeys.item(householdId, itemId),
    queryFn: ({ signal }) => fetchItem(householdId, itemId, signal),
    placeholderData: () => findCachedItem(client, householdId, itemId),
  });
}

function newer(current: InventoryItemDto | undefined, incoming: InventoryItemDto): InventoryItemDto {
  return current && current.id === incoming.id && current.version > incoming.version ? current : incoming;
}

/** Writes a fresh DTO into the item query and every cached list page that contains it. */
export function upsertCachedItem(client: QueryClient, householdId: string, item: InventoryItemDto): void {
  client.setQueryData<InventoryItemDto>(queryKeys.item(householdId, item.id), (current) => newer(current, item));
  client.setQueriesData<ItemPages>({ queryKey: queryKeys.itemsAll(householdId) }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((entry) => (entry.id === item.id ? newer(entry, item) : entry)),
          })),
        }
      : data,
  );
}

/** Removes an item from every cached list (count included) and drops its detail query. */
export function removeCachedItem(client: QueryClient, householdId: string, itemId: string): void {
  client.setQueriesData<ItemPages>({ queryKey: queryKeys.itemsAll(householdId) }, (data) => {
    if (!data || !data.pages.some((page) => page.items.some((item) => item.id === itemId))) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.filter((item) => item.id !== itemId),
        total: Math.max(0, page.total - 1),
      })),
    };
  });
  client.removeQueries({ queryKey: queryKeys.item(householdId, itemId), exact: true });
}

/** Lists (sort order, counts) and the Home dashboard depend on every inventory write. */
export function invalidateInventoryViews(client: QueryClient, householdId: string): void {
  void client.invalidateQueries({ queryKey: queryKeys.itemsAll(householdId) });
  void client.invalidateQueries({ queryKey: queryKeys.dashboard(householdId) });
}

export function useCreateItem() {
  const householdId = useRequiredHouseholdId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateItemRequest) => createItem(householdId, body),
    onSuccess: (item) => {
      client.setQueryData(queryKeys.item(householdId, item.id), item);
      invalidateInventoryViews(client, householdId);
    },
  });
}

export function useUpdateItem(itemId: string) {
  const householdId = useRequiredHouseholdId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateItemRequest) => updateItem(householdId, itemId, body),
    onSuccess: (item) => {
      upsertCachedItem(client, householdId, item);
      invalidateInventoryViews(client, householdId);
    },
  });
}

export function useDeleteItem() {
  const householdId = useRequiredHouseholdId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => deleteItem(householdId, itemId),
    onSuccess: (_result, itemId) => {
      removeCachedItem(client, householdId, itemId);
      invalidateInventoryViews(client, householdId);
    },
  });
}
