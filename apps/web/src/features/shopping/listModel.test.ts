import { describe, expect, it } from 'vitest';
import type { ShoppingItemDto, ShoppingListResponse } from '@homi/shared';
import {
  clearCompletedMessage,
  confirmedClearIds,
  deriveShoppingView,
  optimisticCreatedAt,
  progressOffset,
  progressRatio,
  removeCompletedItems,
  removeItems,
  upsertItem,
  type PendingOp,
} from './listModel';

const ME = { id: '33333333-3333-4333-8333-333333333333', displayName: 'Julian' };

function item(id: string, name: string, overrides: Partial<ShoppingItemDto> = {}): ShoppingItemDto {
  return {
    id,
    name,
    quantity: null,
    unit: null,
    unitPrice: null,
    completed: false,
    completedAt: null,
    completedBy: null,
    sourceItemId: null,
    createdBy: ME,
    createdAt: `2026-10-12T08:00:0${id}.000Z`,
    updatedAt: `2026-10-12T08:00:0${id}.000Z`,
    ...overrides,
  };
}

function done(id: string, name: string, completedAt: string): ShoppingItemDto {
  return item(id, name, { completed: true, completedAt, completedBy: ME });
}

function list(open: ShoppingItemDto[], completed: ShoppingItemDto[] = []): ShoppingListResponse {
  return {
    list: { id: 'list', name: 'Einkaufsliste' },
    open,
    completed,
    stats: { done: completed.length, total: open.length + completed.length },
  };
}

const names = (items: readonly ShoppingItemDto[]) => items.map((entry) => entry.name);

describe('deriveShoppingView', () => {
  const server = list(
    [item('1', 'Milch'), item('2', 'Eier')],
    [done('3', 'Brot', '2026-10-12T09:00:00.000Z'), done('4', 'Joghurt', '2026-10-12T10:00:00.000Z')],
  );

  it('returns the server state without pending operations', () => {
    const view = deriveShoppingView(server, []);
    expect(names(view.open)).toEqual(['Milch', 'Eier']);
    expect(names(view.completed)).toEqual(['Joghurt', 'Brot']);
    expect(view.stats).toEqual({ done: 2, total: 4 });
  });

  it('appends an optimistic row and reconciles it by id once the server returns it', () => {
    const created = item('5', 'Zwiebeln', { quantity: '1', unit: 'KILOGRAMM', unitPrice: '2.40' });
    const ops: PendingOp[] = [{ opId: 1, kind: 'create', item: created }];
    const optimistic = deriveShoppingView(server, ops);
    expect(names(optimistic.open)).toEqual(['Milch', 'Eier', 'Zwiebeln']);
    expect(optimistic.stats).toEqual({ done: 2, total: 5 });

    // A realtime refetch lands while the POST is still pending: same id → one row, server copy.
    const serverCopy = { ...created, createdAt: '2026-10-12T08:00:09.000Z' };
    const refetched = list([...server.open, serverCopy], server.completed);
    const reconciled = deriveShoppingView(refetched, ops);
    expect(reconciled.open.filter((entry) => entry.id === '5')).toEqual([serverCopy]);
    expect(reconciled.stats.total).toBe(5);
  });

  it('ticks off optimistically and keeps a settling row in place', () => {
    const ops: PendingOp[] = [
      { opId: 1, kind: 'update', itemId: '1', completed: true, at: '2026-10-12T11:00:00.000Z', by: ME },
    ];
    const settling = deriveShoppingView(server, ops, new Set(['1']));
    expect(names(settling.open)).toEqual(['Milch', 'Eier']);
    expect(settling.open[0]).toMatchObject({ completed: true, completedBy: ME });
    expect(settling.stats).toEqual({ done: 3, total: 4 });

    const moved = deriveShoppingView(server, ops);
    expect(names(moved.open)).toEqual(['Eier']);
    expect(names(moved.completed)).toEqual(['Milch', 'Joghurt', 'Brot']);
  });

  it('restores a completed row to its original position', () => {
    const ops: PendingOp[] = [{ opId: 1, kind: 'update', itemId: '3', completed: false, at: 'x', by: ME }];
    const view = deriveShoppingView(server, ops);
    expect(names(view.open)).toEqual(['Milch', 'Eier', 'Brot']);
    expect(view.open[2]).toMatchObject({ completed: false, completedAt: null, completedBy: null });
  });

  it('applies field edits, deletions and clear-completed; the latest operation wins', () => {
    const ops: PendingOp[] = [
      { opId: 1, kind: 'update', itemId: '2', fields: { quantity: '12', unit: 'STUECK' }, at: 'x', by: ME },
      { opId: 2, kind: 'update', itemId: '2', completed: true, at: '2026-10-12T12:00:00.000Z', by: ME },
      { opId: 3, kind: 'update', itemId: '2', completed: false, at: 'x', by: ME },
      { opId: 4, kind: 'delete', itemId: '1' },
      { opId: 5, kind: 'clearCompleted', itemIds: ['3', '4'] },
      { opId: 6, kind: 'update', itemId: 'gone', completed: true, at: 'x', by: ME },
    ];
    const view = deriveShoppingView(server, ops);
    expect(view.open).toEqual([expect.objectContaining({ id: '2', quantity: '12', unit: 'STUECK', completed: false })]);
    expect(view.completed).toEqual([]);
    expect(view.stats).toEqual({ done: 0, total: 1 });
  });

  it('handles a list that has not loaded yet', () => {
    const view = deriveShoppingView(undefined, [{ opId: 1, kind: 'create', item: item('1', 'Milch') }]);
    expect(names(view.open)).toEqual(['Milch']);
  });

  it('lets a pending clear hide only rows that are completed (a failed completion shows the row again)', () => {
    const tick: PendingOp = {
      opId: 1,
      kind: 'update',
      itemId: '1',
      completed: true,
      at: '2026-10-12T12:00:00.000Z',
      by: ME,
    };
    const clear: PendingOp = { opId: 2, kind: 'clearCompleted', itemIds: ['1', '3'] };
    // Completion still in flight: the ticked row and Brot are hidden by the clear.
    const pending = deriveShoppingView(server, [tick, clear]);
    expect(names(pending.open)).toEqual(['Eier']);
    expect(names(pending.completed)).toEqual(['Joghurt']);
    // The completion failed (its op is dropped): Milch is open again and stays visible.
    const failed = deriveShoppingView(server, [clear]);
    expect(names(failed.open)).toEqual(['Milch', 'Eier']);
    expect(names(failed.completed)).toEqual(['Joghurt']);
  });

  it('appends a new optimistic row even when the device clock is behind the server', () => {
    const future = '2099-01-01T00:00:00.000Z';
    const existing = [item('1', 'Milch', { createdAt: future }), item('2', 'Eier')];
    const createdAt = optimisticCreatedAt(existing, new Date('2026-10-12T08:00:00.000Z'));
    expect(createdAt).toBe('2099-01-01T00:00:00.001Z');
    expect(optimisticCreatedAt([item('1', 'Milch')], new Date('2030-01-01T00:00:00.000Z'))).toBe(
      '2030-01-01T00:00:00.000Z',
    );
    const view = deriveShoppingView(list(existing), [
      { opId: 1, kind: 'create', item: item('9', 'Zwiebeln', { id: 'new', createdAt }) },
    ]);
    expect(names(view.open)).toEqual(['Eier', 'Milch', 'Zwiebeln']);
  });
});

describe('cache helpers', () => {
  it('moves a confirmed item between the sections and recounts', () => {
    const start = list([item('1', 'Milch'), item('2', 'Eier')]);
    const completed = upsertItem(start, done('1', 'Milch', '2026-10-12T11:00:00.000Z'));
    expect(names(completed.open)).toEqual(['Eier']);
    expect(names(completed.completed)).toEqual(['Milch']);
    expect(completed.stats).toEqual({ done: 1, total: 2 });

    const added = upsertItem(completed, item('3', 'Reis'));
    expect(names(added.open)).toEqual(['Eier', 'Reis']);

    const removed = removeItems(added, ['1', '3']);
    expect(names(removed.open)).toEqual(['Eier']);
    expect(removed.completed).toEqual([]);
    expect(removed.stats).toEqual({ done: 0, total: 1 });

    // "Erledigte löschen" confirmed: open rows among the ids stay (their completion failed).
    const cleared = removeCompletedItems(added, ['1', '3']);
    expect(names(cleared.open)).toEqual(['Eier', 'Reis']);
    expect(cleared.completed).toEqual([]);
    expect(cleared.stats).toEqual({ done: 0, total: 2 });
  });

  it('computes the progress ratio safely', () => {
    expect(progressRatio({ done: 4, total: 12 })).toBeCloseTo(1 / 3);
    expect(progressRatio({ done: 0, total: 0 })).toBe(0);
    expect(progressRatio({ done: 5, total: 4 })).toBe(1);
  });

  it('clears only the snapshotted rows that are still completed', () => {
    const done = (id: string) => item(id, id, { completed: true, completedAt: '2026-10-12T10:00:00.000Z' });
    // Snapshot a, b; meanwhile b was restored and c was ticked off by someone else.
    expect(confirmedClearIds(['a', 'b'], [done('a'), done('c')])).toEqual(['a']);
    expect(clearCompletedMessage(1)).toBe('Der erledigte Artikel wird von der Einkaufsliste entfernt.');
    expect(clearCompletedMessage(4)).toBe('4 erledigte Artikel werden von der Einkaufsliste entfernt.');
    expect(clearCompletedMessage(0)).toBe('Die erledigten Artikel wurden inzwischen wiederhergestellt.');
  });

  it('slides the rounded fill instead of squashing it (translateX offset)', () => {
    expect(progressOffset({ done: 4, total: 12 })).toBe('-66.667%');
    expect(progressOffset({ done: 0, total: 12 })).toBe('-100%');
    expect(progressOffset({ done: 0, total: 0 })).toBe('-100%');
    expect(progressOffset({ done: 12, total: 12 })).toBe('0%');
  });
});
