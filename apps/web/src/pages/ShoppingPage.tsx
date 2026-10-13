import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ShoppingItemDto, ShoppingListResponse } from '@homi/shared';
import { queryKeys } from '@/api/queryKeys';
import { Button, ConfirmDialog, EmptyState, LargeTitleHeader, Screen, SkeletonList } from '@/components';
import { AddItemComposer } from '@/features/shopping/AddItemComposer';
import { CompletedSection } from '@/features/shopping/CompletedSection';
import { EditItemSheet } from '@/features/shopping/EditItemSheet';
import { ShoppingListMeta } from '@/features/shopping/ShoppingListMeta';
import { ShoppingRow } from '@/features/shopping/ShoppingRow';
import { ShoppingToolbar } from '@/features/shopping/ShoppingToolbar';
import { useCompletedExpanded } from '@/features/shopping/completedDisclosure';
import { useItemRemovedNotice } from '@/features/shopping/useItemRemovedNotice';
import { clearCompletedMessage, confirmedClearIds, type ShoppingView } from '@/features/shopping/listModel';
import { useKeepRowFocus } from '@/features/shopping/rowFocus';
import { useListMembers } from '@/features/shopping/useListMembers';
import { newShoppingItem, useShoppingActions, useShoppingList } from '@/features/shopping/useShoppingList';
import { useActiveHousehold, useRequiredHouseholdId } from '@/hooks/useActiveHousehold';
import { useMe } from '@/hooks/useAuth';
import '@/features/shopping/shopping.css';

/** A ticked row keeps its place (checked) this long before it moves to "Erledigt". */
const SETTLE_MS = 350;

const NO_IDS: ReadonlySet<string> = new Set();

/** Ids of the section (open / completed) the row is shown in, in display order. */
function sectionIds(view: ShoppingView, itemId: string): string[] {
  const section = view.open.some((entry) => entry.id === itemId) ? view.open : view.completed;
  return section.map((entry) => entry.id);
}

function idsOf(list: ShoppingListResponse | undefined): ReadonlySet<string> {
  return new Set([...(list?.open ?? []), ...(list?.completed ?? [])].map((item) => item.id));
}

/**
 * Einkaufsliste (design 03 / 03b / 11 / 18, dark 03): shared-list meta + progress, Reminders-style
 * add row, open items, "Erledigt" disclosure. All changes are optimistic and reconciled by id with
 * the realtime refetches of other members' changes.
 */
export function ShoppingPage() {
  const householdId = useRequiredHouseholdId();
  const { household } = useActiveHousehold();
  const { data: me } = useMe();
  const self = me ? { id: me.user.id, displayName: me.user.displayName } : null;
  const client = useQueryClient();

  const [settling, setSettling] = useState<ReadonlySet<string>>(NO_IDS);
  const settleTimers = useRef(new Map<string, number>());
  const list = useShoppingList(householdId, settling);
  const actions = useShoppingActions(householdId, self);
  const keepRowFocus = useKeepRowFocus();
  const { view } = list;
  const members = useListMembers(householdId, me?.user.id);
  const [completedExpanded, setCompletedExpanded] = useCompletedExpanded();
  const [editor, setEditor] = useState<{ open: boolean; item: ShoppingItemDto | null }>({ open: false, item: null });
  // Completed ids shown when "Erledigte löschen" was asked for (null = no confirmation open).
  const [clearSnapshot, setClearSnapshot] = useState<readonly string[] | null>(null);
  // Rows already on screen when the list opened do not fade in; rows that arrive later do.
  const [initialIds] = useState(() =>
    idsOf(client.getQueryData<ShoppingListResponse>(queryKeys.shopping(householdId))),
  );

  useEffect(() => {
    const timers = settleTimers.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const stopSettling = useCallback((itemId: string) => {
    const timer = settleTimers.current.get(itemId);
    if (timer !== undefined) window.clearTimeout(timer);
    settleTimers.current.delete(itemId);
    setSettling((current) => {
      if (!current.has(itemId)) return current;
      const next = new Set(current);
      next.delete(itemId);
      return next;
    });
  }, []);

  const toggle = useCallback(
    (item: ShoppingItemDto, completed: boolean) => {
      keepRowFocus(item.id, sectionIds(view, item.id));
      if (!completed) {
        stopSettling(item.id);
        actions.setCompleted(item.id, false);
        return;
      }
      actions.setCompleted(item.id, true);
      if (item.completed) return;
      setSettling((current) => new Set(current).add(item.id));
      const previous = settleTimers.current.get(item.id);
      if (previous !== undefined) window.clearTimeout(previous);
      settleTimers.current.set(
        item.id,
        window.setTimeout(() => stopSettling(item.id), SETTLE_MS),
      );
    },
    [actions, keepRowFocus, stopSettling, view],
  );

  const remove = useCallback(
    (item: ShoppingItemDto) => {
      keepRowFocus(item.id, sectionIds(view, item.id));
      stopSettling(item.id);
      actions.deleteItem(item.id);
    },
    [actions, keepRowFocus, stopSettling, view],
  );

  const edit = useCallback((item: ShoppingItemDto) => setEditor({ open: true, item }), []);

  const loaded = list.data !== undefined;
  const hasItems = view.stats.total > 0;
  const clearIds = clearSnapshot ? confirmedClearIds(clearSnapshot, view.completed) : [];
  const askClearCompleted = (): void => setClearSnapshot(view.completed.map((item) => item.id));

  // The edited item vanished (deleted by another member, or by this user) → the sheet closes.
  const editedId = editor.item?.id;
  const editedGone =
    editedId !== undefined && loaded && ![...view.open, ...view.completed].some((item) => item.id === editedId);
  useItemRemovedNotice(editor.open, editedId, editedGone);

  const renderRow = (item: ShoppingItemDto) => (
    <ShoppingRow
      key={item.id}
      item={item}
      checked={item.completed}
      animateIn={!initialIds.has(item.id)}
      onToggle={toggle}
      onEdit={edit}
      onDelete={remove}
    />
  );

  return (
    <Screen
      withTabBar
      aria-labelledby="shopping-title"
      header={
        <LargeTitleHeader
          title="Einkaufsliste"
          titleId="shopping-title"
          subtitle="Alles, was noch fehlt."
          trailing={
            <ShoppingToolbar
              completedCount={view.completed.length}
              completedExpanded={completedExpanded}
              onToggleCompleted={() => setCompletedExpanded((current) => !current)}
              onClearCompleted={askClearCompleted}
            />
          }
          accessory={
            hasItems ? (
              <ShoppingListMeta members={members} householdName={household?.name ?? null} stats={view.stats} />
            ) : undefined
          }
        />
      }
    >
      <AddItemComposer
        afterProgress={hasItems}
        onAdd={(values, restore) => {
          const item = newShoppingItem(householdId, values, self, [...view.open, ...view.completed]);
          actions.addItem({ ...item, onRollback: restore });
        }}
      />

      {list.isPending && !hasItems ? (
        <SkeletonList variant="shopping" rows={6} className="shopping-list" label="Einkaufsliste wird geladen …" />
      ) : null}

      {list.isError ? (
        <EmptyState
          className="shopping-error"
          icon="cart"
          title="Liste nicht verfügbar"
          message="Die Einkaufsliste konnte nicht geladen werden."
          action={
            <Button variant="secondary" size="medium" onClick={list.refetch}>
              Erneut versuchen
            </Button>
          }
        />
      ) : null}

      {view.open.length > 0 ? (
        <ul className="homi-card shopping-list" role="list" aria-label="Offene Artikel">
          {view.open.map(renderRow)}
        </ul>
      ) : loaded ? (
        <EmptyState
          className="shopping-empty"
          icon="checkCircle"
          title="Alles erledigt!"
          message="Deine Einkaufsliste ist leer."
        />
      ) : null}

      {view.completed.length > 0 ? (
        <CompletedSection
          count={view.completed.length}
          expanded={completedExpanded}
          onToggle={() => setCompletedExpanded((current) => !current)}
          onClear={askClearCompleted}
        >
          {view.completed.map(renderRow)}
        </CompletedSection>
      ) : null}

      <EditItemSheet
        open={editor.open && !editedGone}
        item={editor.item}
        onClose={() => setEditor((current) => ({ ...current, open: false }))}
        onSave={(item, fields) => {
          if (Object.keys(fields).length > 0) actions.updateItem({ itemId: item.id, fields });
        }}
        onDelete={remove}
      />

      <ConfirmDialog
        open={clearSnapshot !== null}
        title="Erledigte löschen?"
        message={clearCompletedMessage(clearIds.length)}
        onCancel={() => setClearSnapshot(null)}
        onConfirm={() => {
          setClearSnapshot(null);
          if (clearIds.length === 0) return;
          for (const id of clearIds) stopSettling(id);
          actions.clearCompleted(clearIds);
        }}
      />
    </Screen>
  );
}
