import type { ShoppingItemDto, ShoppingListResponse, Unit, UserRef } from '@homi/shared';

/*
 * Pure list logic of the shopping screen (unit-tested in listModel.test.ts).
 *
 * The screen shows `server data + pending operations`: every mutation registers an operation
 * while it is in flight, and the view applies them on top of the latest server snapshot. A
 * realtime refetch that lands mid-mutation therefore never makes an optimistic change flicker
 * back, and rows are reconciled by id – optimistic rows already carry their final id (derived from
 * household + client id exactly like the server does), so a refetch that contains the new item
 * simply replaces the optimistic copy.
 */

export interface ItemFields {
  name: string;
  quantity: string | null;
  unit: Unit | null;
  unitPrice: string | null;
}

export type PendingOp =
  | { opId: number; kind: 'create'; item: ShoppingItemDto }
  | {
      opId: number;
      kind: 'update';
      itemId: string;
      fields?: Partial<ItemFields>;
      completed?: boolean;
      /** Optimistic completion metadata (ISO time, acting user). */
      at: string;
      by: UserRef | null;
    }
  | { opId: number; kind: 'delete'; itemId: string }
  | { opId: number; kind: 'clearCompleted'; itemIds: readonly string[] };

export interface ShoppingView {
  /** Open items, oldest first. Items in `settling` stay here (ticked) until they move. */
  open: ShoppingItemDto[];
  /** Completed items, most recently completed first. */
  completed: ShoppingItemDto[];
  stats: { done: number; total: number };
}

function byCreatedAsc(a: ShoppingItemDto, b: ShoppingItemDto): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function byCompletedDesc(a: ShoppingItemDto, b: ShoppingItemDto): number {
  const at = a.completedAt ?? '';
  const bt = b.completedAt ?? '';
  if (at !== bt) return at > bt ? -1 : 1;
  return a.id > b.id ? -1 : a.id < b.id ? 1 : 0;
}

/** Applies one completion change the way the server does (sets/clears who and when). */
function withCompletion(item: ShoppingItemDto, completed: boolean, at: string, by: UserRef | null): ShoppingItemDto {
  if (item.completed === completed) return item;
  return completed
    ? { ...item, completed: true, completedAt: at, completedBy: by }
    : { ...item, completed: false, completedAt: null, completedBy: null };
}

/**
 * Server snapshot + pending operations (in registration order) → what the screen shows.
 * `settling` holds ids that were just ticked and still play their check animation in place.
 */
export function deriveShoppingView(
  server: ShoppingListResponse | undefined,
  ops: readonly PendingOp[],
  settling: ReadonlySet<string> = new Set(),
): ShoppingView {
  const items = new Map<string, ShoppingItemDto>();
  for (const item of server?.open ?? []) items.set(item.id, item);
  for (const item of server?.completed ?? []) items.set(item.id, item);

  for (const op of ops) {
    switch (op.kind) {
      case 'create':
        // The server copy wins as soon as a refetch contains the item (same id).
        if (!items.has(op.item.id)) items.set(op.item.id, op.item);
        break;
      case 'update': {
        const current = items.get(op.itemId);
        if (!current) break;
        let next = op.fields ? { ...current, ...op.fields } : current;
        if (op.completed !== undefined) next = withCompletion(next, op.completed, op.at, op.by);
        items.set(op.itemId, next);
        break;
      }
      case 'delete':
        items.delete(op.itemId);
        break;
      case 'clearCompleted':
        // Like the server: only rows that are (still) completed go – a completion that failed
        // meanwhile brings its row back as open instead of hiding it.
        for (const id of op.itemIds) if (items.get(id)?.completed) items.delete(id);
        break;
    }
  }

  const all = [...items.values()];
  const open = all.filter((item) => !item.completed || settling.has(item.id)).sort(byCreatedAsc);
  const completed = all.filter((item) => item.completed && !settling.has(item.id)).sort(byCompletedDesc);
  return {
    open,
    completed,
    stats: { done: all.filter((item) => item.completed).length, total: all.length },
  };
}

/** Writes a confirmed item (server response) into the cached list, moving it between sections. */
export function upsertItem(list: ShoppingListResponse, item: ShoppingItemDto): ShoppingListResponse {
  const open = list.open.filter((entry) => entry.id !== item.id);
  const completed = list.completed.filter((entry) => entry.id !== item.id);
  if (item.completed) completed.push(item);
  else open.push(item);
  open.sort(byCreatedAsc);
  completed.sort(byCompletedDesc);
  return { ...list, open, completed, stats: { done: completed.length, total: open.length + completed.length } };
}

/** Removes confirmed deletions from the cached list. */
export function removeItems(list: ShoppingListResponse, itemIds: Iterable<string>): ShoppingListResponse {
  const remove = new Set(itemIds);
  const open = list.open.filter((entry) => !remove.has(entry.id));
  const completed = list.completed.filter((entry) => !remove.has(entry.id));
  return { ...list, open, completed, stats: { done: completed.length, total: open.length + completed.length } };
}

/** "Erledigte löschen" confirmed: removes those of `itemIds` that are completed (open ones stay). */
export function removeCompletedItems(list: ShoppingListResponse, itemIds: Iterable<string>): ShoppingListResponse {
  const remove = new Set(itemIds);
  const completed = list.completed.filter((entry) => !remove.has(entry.id));
  return { ...list, completed, stats: { done: completed.length, total: list.open.length + completed.length } };
}

/**
 * `createdAt` of a new optimistic row: now, but never before the newest row already listed – so a
 * client clock running behind the server cannot sort the new row above older ones (it would jump
 * once the server copy arrives).
 */
export function optimisticCreatedAt(existing: Iterable<Pick<ShoppingItemDto, 'createdAt'>>, now = new Date()): string {
  let latest = now.getTime();
  for (const item of existing) {
    const at = Date.parse(item.createdAt);
    if (Number.isFinite(at) && at >= latest) latest = at + 1;
  }
  return new Date(latest).toISOString();
}

/**
 * "Erledigte löschen": the ids snapshotted when the confirmation opened that are still completed.
 * Rows another member ticks off while the dialog is open are not part of it; rows restored
 * meanwhile drop out – so the dialog's count is exactly what gets deleted.
 */
export function confirmedClearIds(snapshot: readonly string[], completed: readonly ShoppingItemDto[]): string[] {
  const stillCompleted = new Set(completed.map((item) => item.id));
  return snapshot.filter((id) => stillCompleted.has(id));
}

/** Confirmation text for {@link confirmedClearIds}. */
export function clearCompletedMessage(count: number): string {
  if (count === 0) return 'Die erledigten Artikel wurden inzwischen wiederhergestellt.';
  return count === 1
    ? 'Der erledigte Artikel wird von der Einkaufsliste entfernt.'
    : `${count} erledigte Artikel werden von der Einkaufsliste entfernt.`;
}

/** Width fraction of the progress bar (0 … 1). */
export function progressRatio(stats: { done: number; total: number }): number {
  if (stats.total <= 0) return 0;
  return Math.min(1, Math.max(0, stats.done / stats.total));
}

/**
 * `translateX` offset of the full-width progress fill: "-100%" (nothing done) … "0%" (all done).
 * Sliding keeps the fill's 2 px rounded end at every ratio (`scaleX` would squash it).
 */
export function progressOffset(stats: { done: number; total: number }): string {
  const offset = (progressRatio(stats) - 1) * 100;
  return `${offset === 0 ? 0 : Number(offset.toFixed(3))}%`;
}
