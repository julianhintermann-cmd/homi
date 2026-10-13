import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DashboardDto } from '@homi/shared';
import { fetchDashboard, setShoppingItemCompleted } from '@/api/dashboard';
import { queryKeys } from '@/api/queryKeys';
import { showToast } from '@/components';

/** Home aggregates; realtime `sync` (scope `dashboard`/`members`) invalidates the key. */
export function useDashboard(householdId: string) {
  return useQuery({
    queryKey: queryKeys.dashboard(householdId),
    queryFn: ({ signal }) => fetchDashboard(householdId, signal),
    staleTime: 15_000,
  });
}

/**
 * Ticks an open shopping item in the Home preview: optimistic (row shows the check, the open
 * count drops), rolled back on error; afterwards the dashboard and the shopping list refetch –
 * the next open item moves up.
 */
export function useCompleteShoppingItem(householdId: string) {
  const client = useQueryClient();
  const key = queryKeys.dashboard(householdId);
  const mutationKey = ['complete-shopping-item', householdId] as const;
  return useMutation({
    mutationKey,
    mutationFn: (shoppingItemId: string) => setShoppingItemCompleted(householdId, shoppingItemId, true),
    onMutate: async (shoppingItemId) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<DashboardDto>(key);
      client.setQueryData<DashboardDto>(key, (current) =>
        current
          ? {
              ...current,
              openShoppingCount: Math.max(0, current.openShoppingCount - 1),
              openShoppingItems: current.openShoppingItems.map((item) =>
                item.id === shoppingItemId ? { ...item, completed: true } : item,
              ),
            }
          : current,
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSettled: async () => {
      // Rapid ticks: refetch once the last one settled, so no response overwrites a newer tick.
      if (client.isMutating({ mutationKey }) > 1) return;
      await Promise.all([
        client.invalidateQueries({ queryKey: key }),
        client.invalidateQueries({ queryKey: queryKeys.shopping(householdId) }),
      ]);
    },
  });
}

/**
 * "Rückgängig" in the toast after ticking an item on Home: reopens it (`completed: false`), then
 * the dashboard and the shopping list refetch. Hook-level callbacks, so the refetch (and an error
 * toast) also happen when Home was left while the toast was still visible.
 */
export function useReopenShoppingItem(householdId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (shoppingItemId: string) => setShoppingItemCompleted(householdId, shoppingItemId, false),
    onError: (error) => {
      showToast({ message: error.message || 'Konnte nicht rückgängig gemacht werden', tone: 'error' });
    },
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.dashboard(householdId) }),
        client.invalidateQueries({ queryKey: queryKeys.shopping(householdId) }),
      ]);
    },
  });
}
