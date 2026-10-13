import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  shoppingItemIdFor,
  type ShoppingItemDto,
  type ShoppingListResponse,
  type UpdateShoppingItemRequest,
  type UserRef,
} from '@homi/shared';
import { isApiError } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import {
  clearCompletedShoppingItems,
  createShoppingItem,
  deleteShoppingItem,
  shoppingListQueryOptions,
  updateShoppingItem,
} from '@/api/shopping';
import { showToast } from '@/components';
import {
  deriveShoppingView,
  optimisticCreatedAt,
  removeCompletedItems,
  removeItems,
  upsertItem,
  type ItemFields,
  type ShoppingView,
} from './listModel';
import { createQueueKey, runSerially, usePendingOpsFor, usePendingShoppingOps } from './pendingOps';
import type { ItemDraftValues } from './draft';

/*
 * Data layer of the shopping screen: the list query plus optimistic mutations.
 *
 * Every mutation registers a pending op immediately (the row changes on tap), runs serially per
 * item, writes the confirmed DTO into the cache on success and then removes its op after an
 * authoritative refetch – so neither a realtime refetch landing mid-flight nor the refetch after
 * success can make a row flicker. On error the op is dropped at once (= rollback) and a toast
 * explains what happened.
 */

const FALLBACK_ERROR = 'Die Änderung konnte nicht gespeichert werden.';

function errorMessage(error: unknown): string {
  return isApiError(error) ? error.message : FALLBACK_ERROR;
}

function isNotFound(error: unknown): boolean {
  return isApiError(error) && error.status === 404;
}

/**
 * Random RFC 9562 v4 id for `clientId` – `crypto.randomUUID` needs a secure context (plain-HTTP
 * LAN testing lacks it).
 */
export function newClientId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface OpContext {
  opId: number;
}

/** Confirmed state → cache, then an authoritative refetch (cancels stale in-flight fetches). */
async function confirm(
  client: QueryClient,
  householdId: string,
  update: (list: ShoppingListResponse) => ShoppingListResponse,
): Promise<void> {
  const key = queryKeys.shopping(householdId);
  client.setQueryData<ShoppingListResponse>(key, (list) => (list ? update(list) : list));
  await client.invalidateQueries({ queryKey: key }).catch(() => undefined);
}

export interface AddItemVariables {
  /** Idempotency key of the create request. */
  clientId: string;
  /** Optimistic row; its `id` is `shoppingItemIdFor(householdId, clientId)` (the final id). */
  item: ShoppingItemDto;
  /** Called after a failed create (e.g. to put the text back into the add row). */
  onRollback?: () => void;
}

export interface UpdateItemVariables {
  itemId: string;
  fields?: Partial<ItemFields>;
  completed?: boolean;
}

export interface ShoppingListState {
  view: ShoppingView;
  data: ShoppingListResponse | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

/** The list as the screen shows it: server data + in-flight changes (`settling` rows stay in place). */
export function useShoppingList(householdId: string, settling?: ReadonlySet<string>): ShoppingListState {
  const query = useQuery(shoppingListQueryOptions(householdId));
  const ops = usePendingOpsFor(householdId);
  const view = useMemo(() => deriveShoppingView(query.data, ops, settling), [query.data, ops, settling]);
  const { refetch } = query;
  return {
    view,
    data: query.data,
    isPending: query.isPending,
    isError: query.isError && query.data === undefined,
    error: query.error,
    refetch: useCallback(() => void refetch(), [refetch]),
  };
}

export interface ShoppingActions {
  /** Optimistic create under the final (household-scoped, derived) `item.id`; see `newShoppingItem`. */
  addItem: (variables: AddItemVariables) => void;
  updateItem: (variables: UpdateItemVariables) => void;
  setCompleted: (itemId: string, completed: boolean) => void;
  deleteItem: (itemId: string) => void;
  /** Deletes exactly these completed items (the ones the user confirmed). */
  clearCompleted: (itemIds: readonly string[]) => void;
}

/** Builds the optimistic DTO of a new row (`createdBy` = me, `createdAt` = now unless given). */
export function optimisticItem(
  id: string,
  values: ItemDraftValues,
  me: UserRef | null,
  createdAt = new Date().toISOString(),
): ShoppingItemDto {
  const now = createdAt;
  return {
    id,
    name: values.name,
    quantity: values.quantity,
    unit: values.unit,
    unitPrice: values.unitPrice,
    completed: false,
    completedAt: null,
    completedBy: null,
    sourceItemId: null,
    createdBy: me,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * A new row for the add row: a fresh `clientId`, the household-scoped id the server will store it
 * under, and a `createdAt` after every row already listed (`existing`), so it is appended.
 */
export function newShoppingItem(
  householdId: string,
  values: ItemDraftValues,
  me: UserRef | null,
  existing: Iterable<Pick<ShoppingItemDto, 'createdAt'>> = [],
): Omit<AddItemVariables, 'onRollback'> {
  const clientId = newClientId();
  const id = shoppingItemIdFor(householdId, clientId);
  return { clientId, item: optimisticItem(id, values, me, optimisticCreatedAt(existing)) };
}

export function useShoppingActions(householdId: string, me: UserRef | null): ShoppingActions {
  const client = useQueryClient();
  const { add, remove } = usePendingShoppingOps.getState();

  const create = useMutation<ShoppingItemDto, unknown, AddItemVariables, OpContext>({
    // Queued per household (POSTs arrive in the order typed – the server orders by insertion) and
    // per item (a completion of the new row waits for its create).
    mutationFn: ({ clientId, item }) =>
      runSerially([createQueueKey(householdId), item.id], () =>
        createShoppingItem(householdId, {
          clientId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
        }),
      ),
    onMutate: ({ item }) => ({ opId: add(householdId, { kind: 'create', item }) }),
    onSuccess: async (dto, _variables, context) => {
      await confirm(client, householdId, (list) => upsertItem(list, dto));
      remove(householdId, context.opId);
    },
    onError: (error, variables, context) => {
      if (context) remove(householdId, context.opId);
      variables.onRollback?.();
      showToast({ message: errorMessage(error), tone: 'error' });
      void client.invalidateQueries({ queryKey: queryKeys.shopping(householdId) });
    },
  });

  const update = useMutation<ShoppingItemDto, unknown, UpdateItemVariables, OpContext>({
    mutationFn: ({ itemId, fields, completed }) => {
      const body: UpdateShoppingItemRequest = { ...fields, ...(completed === undefined ? {} : { completed }) };
      return runSerially(itemId, () => updateShoppingItem(householdId, itemId, body));
    },
    onMutate: ({ itemId, fields, completed }) => ({
      opId: add(householdId, {
        kind: 'update',
        itemId,
        ...(fields ? { fields } : {}),
        ...(completed === undefined ? {} : { completed }),
        at: new Date().toISOString(),
        by: me,
      }),
    }),
    onSuccess: async (dto, _variables, context) => {
      await confirm(client, householdId, (list) => upsertItem(list, dto));
      remove(householdId, context.opId);
    },
    onError: (error, _variables, context) => {
      if (context) remove(householdId, context.opId);
      showToast({
        message: isNotFound(error) ? 'Dieser Artikel wurde inzwischen entfernt.' : errorMessage(error),
        tone: 'error',
      });
      void client.invalidateQueries({ queryKey: queryKeys.shopping(householdId) });
    },
  });

  const destroy = useMutation<void, unknown, string, OpContext>({
    mutationFn: (itemId) =>
      runSerially(itemId, async () => {
        try {
          await deleteShoppingItem(householdId, itemId);
        } catch (error) {
          // Already gone (someone else was faster) – that is what the user wanted.
          if (!isNotFound(error)) throw error;
        }
      }),
    onMutate: (itemId) => ({ opId: add(householdId, { kind: 'delete', itemId }) }),
    onSuccess: async (_result, itemId, context) => {
      await confirm(client, householdId, (list) => removeItems(list, [itemId]));
      remove(householdId, context.opId);
    },
    onError: (error, _itemId, context) => {
      if (context) remove(householdId, context.opId);
      showToast({ message: errorMessage(error), tone: 'error' });
      void client.invalidateQueries({ queryKey: queryKeys.shopping(householdId) });
    },
  });

  const clear = useMutation<unknown, unknown, readonly string[], OpContext>({
    // Waits for every request still in flight for these rows (a completion – or the create – of a
    // row ticked off just before), so the server deletes what the user confirmed.
    mutationFn: (itemIds) => runSerially(itemIds, () => clearCompletedShoppingItems(householdId, itemIds)),
    onMutate: (itemIds) => ({ opId: add(householdId, { kind: 'clearCompleted', itemIds }) }),
    onSuccess: async (_result, itemIds, context) => {
      // Only the confirmed rows: an item another member ticked off meanwhile stays, and so does
      // a row whose completion failed (it is open again).
      await confirm(client, householdId, (list) => removeCompletedItems(list, itemIds));
      remove(householdId, context.opId);
    },
    onError: (error, _itemIds, context) => {
      if (context) remove(householdId, context.opId);
      showToast({ message: errorMessage(error), tone: 'error' });
      void client.invalidateQueries({ queryKey: queryKeys.shopping(householdId) });
    },
  });

  const { mutate: createMutate } = create;
  const { mutate: updateMutate } = update;
  const { mutate: destroyMutate } = destroy;
  const { mutate: clearMutate } = clear;

  return useMemo<ShoppingActions>(
    () => ({
      addItem: (variables) => createMutate(variables),
      updateItem: (variables) => updateMutate(variables),
      setCompleted: (itemId, completed) => updateMutate({ itemId, completed }),
      deleteItem: (itemId) => destroyMutate(itemId),
      clearCompleted: (itemIds) => clearMutate(itemIds),
    }),
    [clearMutate, createMutate, destroyMutate, updateMutate],
  );
}
