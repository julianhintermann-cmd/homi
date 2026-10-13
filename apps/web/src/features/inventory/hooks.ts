import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { ITEM_SORT_VALUES, lineTotal, type InventoryItemDto, type ItemSort } from '@homi/shared';
import { isApiError } from '@/api/client';
import { changeItemQuantity } from '@/api/inventory';
import { createShoppingItem } from '@/api/shopping';
import { queryKeys } from '@/api/queryKeys';
import { showToast } from '@/components';
import { useRequiredHouseholdId } from '@/hooks/useActiveHousehold';
import { QuantityQueue } from './quantityQueue';
import { upsertCachedItem } from './queries';

// ── Debounce ────────────────────────────────────────────────────────────────

/** `value` after it stopped changing for `delayMs` (search field: 250 ms). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (Object.is(value, debounced)) return undefined;
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, debounced, delayMs]);
  return debounced;
}

// ── UI state shared between the sheet and the list ─────────────────────────

interface InventoryUiState {
  /** Freshly created item, highlighted in the list (design 14). */
  highlightedItemId: string | null;
  highlight: (itemId: string) => void;
  clearHighlight: (itemId?: string) => void;
}

export const HIGHLIGHT_DURATION_MS = 3_200;

export const useInventoryUiStore = create<InventoryUiState>()((set, get) => ({
  highlightedItemId: null,
  highlight: (itemId) => {
    set({ highlightedItemId: itemId });
    window.setTimeout(() => get().clearHighlight(itemId), HIGHLIGHT_DURATION_MS);
  },
  clearHighlight: (itemId) => {
    if (itemId === undefined || get().highlightedItemId === itemId) set({ highlightedItemId: null });
  },
}));

// ── Sort preference (per device) ────────────────────────────────────────────

const SORT_STORAGE_KEY = 'homi:inventory-sort';
/** Newest changes first – new items appear on top like in design 14. */
export const DEFAULT_SORT: ItemSort = 'recent';

function readSort(): ItemSort {
  try {
    const stored = window.localStorage.getItem(SORT_STORAGE_KEY);
    return (ITEM_SORT_VALUES as readonly string[]).includes(stored ?? '') ? (stored as ItemSort) : DEFAULT_SORT;
  } catch {
    return DEFAULT_SORT;
  }
}

export function useSortPreference(): [ItemSort, (sort: ItemSort) => void] {
  const [sort, setSortState] = useState<ItemSort>(readSort);
  const setSort = useCallback((next: ItemSort) => {
    setSortState(next);
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, next);
    } catch {
      // per-device convenience only
    }
  }, []);
  return [sort, setSort];
}

// ── Infinite scroll ─────────────────────────────────────────────────────────

/** Calls `onVisible` when the sentinel comes within 600 px of the scroll container's viewport. */
export function useInfiniteScroll(
  sentinel: RefObject<HTMLElement | null>,
  root: RefObject<HTMLElement | null> | null,
  enabled: boolean,
  onVisible: () => void,
): void {
  const callback = useRef(onVisible);
  useEffect(() => {
    callback.current = onVisible;
  }, [onVisible]);

  useEffect(() => {
    const target = sentinel.current;
    if (!enabled || !target || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) callback.current();
      },
      { root: root?.current ?? null, rootMargin: '0px 0px 600px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [enabled, root, sentinel]);
}

// ── Quantity (optimistic, serialised atomic deltas) ────────────────────────

export function quantityErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 404) return 'Dieser Artikel existiert nicht mehr.';
    if (error.isNetworkError) return 'Keine Verbindung – die Menge wurde nicht gespeichert.';
    return error.message;
  }
  return 'Die Menge konnte nicht gespeichert werden.';
}

/**
 * Stepper queues with outstanding changes, by item id. A queue stays registered after its screen
 * was left until its last request returned, so the edit form can still wait for it.
 */
const activeQueues = new Map<string, QuantityQueue<InventoryItemDto>>();
/** Mounted stepper screens per queue (React may unmount and mount an effect again). */
const queueMounts = new WeakMap<QuantityQueue<InventoryItemDto>, number>();

/** Upper bound for waiting on outstanding quantity requests before the edit form opens anyway. */
export const SETTLE_TIMEOUT_MS = 8_000;

/** `true` while quantity changes of the item are waiting or in flight. */
export function hasPendingQuantityChanges(itemId: string): boolean {
  return activeQueues.get(itemId)?.busy ?? false;
}

/**
 * Sends the item's outstanding quantity taps now and resolves when the server answered (or after
 * `timeoutMs`). The edit form then starts from the version that contains them – otherwise saving
 * it would fail with a version conflict caused by the user's own taps.
 */
export function settleQuantityChanges(itemId: string, timeoutMs = SETTLE_TIMEOUT_MS): Promise<void> {
  const queue = activeQueues.get(itemId);
  if (!queue?.busy) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    void queue.settle().then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export interface QuantityControl {
  /** Displayed quantity (decimal string). */
  quantity: string;
  /** Displayed total value for the optimistic quantity (`null` when the price is unknown). */
  totalValue: string | null;
  busy: boolean;
  add: (delta: string) => void;
  setTo: (quantity: string) => void;
}

/**
 * Stepper state of the item details screen. Mount it keyed by the item id. Pending changes are
 * still sent when the screen is left.
 */
export function useQuantityQueue(item: InventoryItemDto): QuantityControl {
  const householdId = useRequiredHouseholdId();
  const client = useQueryClient();
  const [queue] = useState(
    () =>
      new QuantityQueue<InventoryItemDto>(
        { quantity: item.quantity, version: item.version },
        {
          send: (delta) => changeItemQuantity(householdId, item.id, delta),
          onConfirmed: (updated) => {
            upsertCachedItem(client, householdId, updated);
            void client.invalidateQueries({ queryKey: queryKeys.dashboard(householdId) });
            // "Zuletzt geändert" order changed – refetch lists when they are shown next.
            void client.invalidateQueries({ queryKey: queryKeys.itemsAll(householdId), refetchType: 'none' });
          },
          onError: (error) => {
            showToast({ tone: 'error', message: quantityErrorMessage(error) });
            void client.invalidateQueries({ queryKey: queryKeys.item(householdId, item.id) });
          },
        },
      ),
  );

  useEffect(() => {
    queue.sync({ quantity: item.quantity, version: item.version });
  }, [queue, item.quantity, item.version]);

  // Registered while mounted; on unmount pending taps are still sent and the queue stays findable
  // until they returned.
  useEffect(() => {
    activeQueues.set(item.id, queue);
    queueMounts.set(queue, (queueMounts.get(queue) ?? 0) + 1);
    return () => {
      queueMounts.set(queue, (queueMounts.get(queue) ?? 1) - 1);
      void queue.settle().then(() => {
        if (queueMounts.get(queue) === 0 && activeQueues.get(item.id) === queue) activeQueues.delete(item.id);
      });
    };
  }, [queue, item.id]);

  const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot);
  const add = useCallback((delta: string) => queue.add(delta), [queue]);
  const setTo = useCallback((quantity: string) => queue.setTo(quantity), [queue]);
  return {
    quantity: snapshot.quantity,
    totalValue: lineTotal(snapshot.quantity, item.unitPrice),
    busy: snapshot.busy,
    add,
    setTo,
  };
}

// ── "Zur Einkaufsliste" ─────────────────────────────────────────────────────

/** `POST /households/:hid/shopping/items` for an inventory item (quantity 1, same unit, linked). */
export function useAddToShoppingList() {
  const householdId = useRequiredHouseholdId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (item: Pick<InventoryItemDto, 'id' | 'name' | 'unit'>) =>
      createShoppingItem(householdId, { name: item.name, unit: item.unit, quantity: '1', sourceItemId: item.id }),
    onSuccess: () => {
      showToast({ message: 'Zur Einkaufsliste hinzugefügt' });
      void client.invalidateQueries({ queryKey: queryKeys.shopping(householdId) });
      void client.invalidateQueries({ queryKey: queryKeys.dashboard(householdId) });
    },
    onError: (error) => {
      showToast({
        tone: 'error',
        message: isApiError(error) && !error.isNetworkError ? error.message : 'Keine Verbindung zum Server.',
      });
    },
  });
}
