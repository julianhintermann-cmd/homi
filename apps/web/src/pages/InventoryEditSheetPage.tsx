import { useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { InventoryItemDto } from '@homi/shared';
import { deleteItem } from '@/api/inventory';
import { isApiError } from '@/api/client';
import { Button, EmptyState, SheetHeader, Skeleton, showToast } from '@/components';
import { useRequiredHouseholdId } from '@/hooks/useActiveHousehold';
import { ItemForm } from '@/features/inventory/ItemForm';
import { useInventoryUiStore } from '@/features/inventory/hooks';
import { invalidateInventoryViews, removeCachedItem, useInventoryItem } from '@/features/inventory/queries';
import { useItemActions } from '@/features/inventory/useItemActions';
import { getBackgroundLocation, useCloseSheet } from '@/routes/navigation';
import { paths } from '@/routes/paths';
import '@/features/inventory/inventory.css';

export interface InventoryEditSheetPageProps {
  /** `new`: /inventar/neu – `edit`: /inventar/:id/bearbeiten */
  mode: 'new' | 'edit';
}

/** History position of the current entry (React Router stores it in `history.state.idx`). */
function historyIndex(): number {
  const state: unknown = window.history.state;
  const idx = typeof state === 'object' && state !== null ? (state as { idx?: unknown }).idx : undefined;
  return typeof idx === 'number' ? idx : 0;
}

/** Sheet route for design 06 (Neuer Artikel), 07 (Artikel bearbeiten), 13 (photo source) and 15 (delete). */
export function InventoryEditSheetPage({ mode }: InventoryEditSheetPageProps) {
  const { id = '' } = useParams<{ id: string }>();
  const location = useLocation();
  const draftScope = `${useRequiredHouseholdId()}:${mode === 'new' ? 'new' : id}:${location.key}`;
  return mode === 'new' ? (
    <NewItemSheet draftScope={draftScope} />
  ) : (
    <EditItemSheet itemId={id} draftScope={draftScope} />
  );
}

function NewItemSheet({ draftScope }: { draftScope: string }) {
  const householdId = useRequiredHouseholdId();
  const client = useQueryClient();
  const location = useLocation();
  const closeSheet = useCloseSheet();
  const highlight = useInventoryUiStore((state) => state.highlight);

  const undo = useCallback(
    (item: InventoryItemDto) => {
      removeCachedItem(client, householdId, item.id);
      deleteItem(householdId, item.id)
        .catch((error: unknown) => {
          if (isApiError(error) && error.status === 404) return;
          showToast({ tone: 'error', message: 'Rückgängig machen ist fehlgeschlagen.' });
        })
        .finally(() => invalidateInventoryViews(client, householdId));
    },
    [client, householdId],
  );

  const onCreated = (item: InventoryItemDto): void => {
    // Back to the list (design 14) – also when the sheet was opened from Home.
    const background = getBackgroundLocation(location.state);
    if (background?.pathname === paths.inventory) closeSheet();
    else closeSheet(paths.inventory);
    highlight(item.id);
    showToast({ message: `${item.name} hinzugefügt`, actionLabel: 'Rückgängig', onAction: () => undo(item) });
  };

  return (
    <ItemForm
      mode="new"
      draftScope={draftScope}
      onCreated={onCreated}
      onSaved={() => closeSheet()}
      onMissing={() => closeSheet(paths.inventory)}
    />
  );
}

function EditItemSheet({ itemId, draftScope }: { itemId: string; draftScope: string }) {
  const query = useInventoryItem(itemId);
  const location = useLocation();
  const navigate = useNavigate();
  const closeSheet = useCloseSheet();

  /** After deleting: pop the sheet *and* the details screen of the deleted item when possible. */
  const leaveDeletedItem = useCallback(() => {
    const background = getBackgroundLocation(location.state);
    if (background?.pathname === paths.inventoryItem(itemId) && historyIndex() >= 2) void navigate(-2);
    else closeSheet(paths.inventory);
  }, [closeSheet, itemId, location.state, navigate]);

  const actions = useItemActions({ onDeleted: leaveDeletedItem });
  const missing = query.isError && isApiError(query.error) && query.error.status === 404;
  const item = missing ? undefined : query.data;

  if (missing) {
    return (
      <div className="item-form">
        <SheetHeader title="Artikel bearbeiten" />
        <EmptyState
          icon="tray"
          title="Artikel nicht gefunden"
          message="Dieser Artikel wurde inzwischen gelöscht."
          action={
            <Button size="medium" onClick={() => closeSheet(paths.inventory)}>
              Zum Inventar
            </Button>
          }
        />
      </div>
    );
  }

  if (!item || query.isPlaceholderData) {
    return (
      <div className="item-form">
        <SheetHeader title="Artikel bearbeiten" />
        {query.isError ? (
          <EmptyState
            icon="tray"
            title="Artikel nicht verfügbar"
            message="Der Artikel konnte nicht geladen werden."
            action={
              <Button size="medium" variant="secondary" onClick={() => void query.refetch()}>
                Erneut versuchen
              </Button>
            }
          />
        ) : (
          <div className="item-form__fields" role="status" aria-busy="true" aria-label="Artikel wird geladen …">
            <Skeleton height={200} radius={22} />
            <Skeleton height={76} radius={14} />
            <Skeleton height={156} radius={16} />
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <ItemForm
        // The form keeps the version it started from; conflicts are resolved inside it.
        key={item.id}
        mode="edit"
        item={item}
        draftScope={draftScope}
        onCreated={() => closeSheet()}
        onSaved={() => closeSheet()}
        onRequestDelete={() => actions.askDelete(item)}
        onMissing={leaveDeletedItem}
      />
      {actions.dialog}
    </>
  );
}
