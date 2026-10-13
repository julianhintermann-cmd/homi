import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { InventoryItemDto } from '@homi/shared';
import { isApiError } from '@/api/client';
import { ConfirmDialog, showToast, type ContextMenuItem } from '@/components';
import { useActiveHousehold } from '@/hooks/useActiveHousehold';
import { haptic } from '@/lib/haptics';
import { useOpenSheet } from '@/routes/navigation';
import { paths } from '@/routes/paths';
import { deleteConfirmMessage, shareText } from './format';
import { hasPendingQuantityChanges, settleQuantityChanges, useAddToShoppingList } from './hooks';
import { removeCachedItem, useDeleteItem } from './queries';

type ActionItem = Pick<InventoryItemDto, 'id' | 'name' | 'quantity' | 'unit' | 'totalValue'>;

/** `true` when the browser can share (Web Share API) or at least copy to the clipboard. */
export function canShareItems(): boolean {
  if (typeof navigator === 'undefined') return false;
  return typeof navigator.share === 'function' || typeof navigator.clipboard?.writeText === 'function';
}

/** System share sheet when available, otherwise copies name, quantity and link to the clipboard. */
export async function shareItem(item: ActionItem): Promise<void> {
  const url = new URL(paths.inventoryItem(item.id), window.location.origin).toString();
  const text = shareText(item);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: item.name, text, url });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        showToast({ tone: 'error', message: 'Teilen ist fehlgeschlagen.' });
      }
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    showToast({ message: 'In die Zwischenablage kopiert' });
  } catch {
    showToast({ tone: 'error', message: 'Teilen ist auf diesem Gerät nicht möglich.' });
  }
}

export interface ItemActions {
  /** Context menu of design 16: Bearbeiten, Zur Einkaufsliste, Teilen, Löschen. */
  menuItems: (item: InventoryItemDto) => ContextMenuItem[];
  edit: (item: Pick<InventoryItemDto, 'id'>) => void;
  addToShopping: (item: InventoryItemDto) => void;
  askDelete: (item: InventoryItemDto) => void;
  addingToShopping: boolean;
  /**
   * Item whose edit sheet waits for the user's own quantity taps to reach the server (`null` =
   * none) – show the "Bearbeiten" button as busy meanwhile.
   */
  openingEditFor: string | null;
  /** The delete confirmation (design 15) – render it once. */
  dialog: ReactNode;
}

export interface UseItemActionsOptions {
  /** After a successful delete (e.g. leave the details screen). */
  onDeleted?: (item: InventoryItemDto) => void;
}

export function useItemActions({ onDeleted }: UseItemActionsOptions = {}): ItemActions {
  const openSheet = useOpenSheet();
  const client = useQueryClient();
  const { household, householdId } = useActiveHousehold();
  const { mutate: addToShoppingList, isPending: addingToShopping } = useAddToShoppingList();
  const remove = useDeleteItem();
  const [pending, setPending] = useState<InventoryItemDto | null>(null);
  // Keeps the dialog text stable while it fades out.
  const [shown, setShown] = useState<InventoryItemDto | null>(null);
  const [openingEditFor, setOpeningEditFor] = useState<string | null>(null);
  const openingEditRef = useRef<string | null>(null);
  const mounted = useRef(true);
  const onDeletedRef = useRef(onDeleted);
  useEffect(() => {
    onDeletedRef.current = onDeleted;
  }, [onDeleted]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const edit = useCallback(
    (item: Pick<InventoryItemDto, 'id'>) => {
      const target = paths.inventoryEdit(item.id);
      if (!hasPendingQuantityChanges(item.id)) {
        openSheet(target);
        return;
      }
      // Own stepper taps still on their way: open the form once they are saved, so it starts from
      // the version that contains them (no version conflict blamed on "someone else").
      if (openingEditRef.current === item.id) return;
      openingEditRef.current = item.id;
      setOpeningEditFor(item.id);
      void settleQuantityChanges(item.id).then(() => {
        openingEditRef.current = null;
        if (!mounted.current) return;
        setOpeningEditFor(null);
        openSheet(target);
      });
    },
    [openSheet],
  );
  const addToShopping = useCallback((item: InventoryItemDto) => addToShoppingList(item), [addToShoppingList]);
  const askDelete = useCallback((item: InventoryItemDto) => {
    haptic('warning');
    setShown(item);
    setPending(item);
  }, []);

  const confirmDelete = (): void => {
    const item = pending;
    if (!item) return;
    remove.mutate(item.id, {
      onSuccess: () => {
        setPending(null);
        onDeletedRef.current?.(item);
      },
      onError: (error) => {
        setPending(null);
        if (isApiError(error) && error.status === 404) {
          // Somebody else was faster – the result is the same.
          if (householdId) removeCachedItem(client, householdId, item.id);
          onDeletedRef.current?.(item);
          return;
        }
        showToast({
          tone: 'error',
          message: isApiError(error) && !error.isNetworkError ? error.message : 'Löschen ist fehlgeschlagen.',
        });
      },
    });
  };

  const menuItems = useCallback(
    (item: InventoryItemDto): ContextMenuItem[] => [
      { key: 'edit', label: 'Bearbeiten', icon: 'pencil', onSelect: () => edit(item) },
      { key: 'shopping', label: 'Zur Einkaufsliste', icon: 'cart', onSelect: () => addToShopping(item) },
      ...(canShareItems()
        ? [{ key: 'share', label: 'Teilen', icon: 'arrowUp' as const, onSelect: () => void shareItem(item) }]
        : []),
      { key: 'delete', label: 'Löschen', icon: 'trash', destructive: true, onSelect: () => askDelete(item) },
    ],
    [addToShopping, askDelete, edit],
  );

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      title="Artikel löschen?"
      message={shown ? deleteConfirmMessage(shown.name, household?.name) : undefined}
      confirmLabel="Löschen"
      busy={remove.isPending}
      onCancel={() => setPending(null)}
      onConfirm={confirmDelete}
    />
  );

  return { menuItems, edit, addToShopping, askDelete, addingToShopping, openingEditFor, dialog };
}
