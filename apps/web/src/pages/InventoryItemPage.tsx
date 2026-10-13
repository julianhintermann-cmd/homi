import { useState, type MouseEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { isApiError } from '@/api/client';
import {
  Button,
  ContextMenu,
  EmptyState,
  GlassToolbar,
  GlassToolbarItem,
  InlineHeader,
  Screen,
  Skeleton,
  type AnchorRect,
} from '@/components';
import { ItemDetail } from '@/features/inventory/ItemDetail';
import { useInventoryItem } from '@/features/inventory/queries';
import { useItemActions } from '@/features/inventory/useItemActions';
import { useGoBack } from '@/routes/navigation';
import { paths } from '@/routes/paths';
import '@/features/inventory/inventory.css';

/** Artikel-Details (design 05). Deleted elsewhere → friendly not-found state. */
export function InventoryItemPage() {
  const { id = '' } = useParams<{ id: string }>();
  const goBack = useGoBack(paths.inventory);
  const navigate = useNavigate();
  const query = useInventoryItem(id);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);
  const actions = useItemActions({ onDeleted: () => goBack() });
  // A 404 wins over stale cached data: the item was deleted (or never belonged to this household).
  const notFound = query.isError && isApiError(query.error) && query.error.status === 404;
  const item = notFound ? undefined : query.data;

  const openMenu = (event: MouseEvent<HTMLButtonElement>): void => {
    const rect = event.currentTarget.closest('.homi-glass-toolbar')?.getBoundingClientRect();
    if (!rect) return;
    setMenuAnchor({
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
  };

  return (
    <Screen
      aria-label={item ? item.name : 'Artikel'}
      header={
        <InlineHeader
          onBack={goBack}
          backLabel="Zurück zum Inventar"
          trailing={
            item ? (
              <GlassToolbar label="Artikel-Aktionen">
                <GlassToolbarItem
                  icon="ellipsis"
                  label="Weitere Aktionen"
                  aria-haspopup="menu"
                  aria-expanded={menuAnchor !== null}
                  onClick={openMenu}
                />
              </GlassToolbar>
            ) : null
          }
        />
      }
    >
      {notFound ? null : item ? (
        <ItemDetail
          key={item.id}
          item={item}
          onEdit={() => actions.edit(item)}
          onAddToShopping={() => actions.addToShopping(item)}
          addingToShopping={actions.addingToShopping}
          editPending={actions.openingEditFor === item.id}
        />
      ) : null}
      {notFound ? (
        <EmptyState
          className="item-detail__missing"
          icon="tray"
          title="Artikel nicht gefunden"
          message="Dieser Artikel wurde gelöscht oder gehört nicht zu deinem Haushalt."
          action={
            <Button size="medium" onClick={() => void navigate(paths.inventory, { replace: true })}>
              Zum Inventar
            </Button>
          }
        />
      ) : !item && query.isError ? (
        <EmptyState
          className="item-detail__missing"
          icon="tray"
          title="Artikel nicht verfügbar"
          message="Der Artikel konnte nicht geladen werden."
          action={
            <Button size="medium" variant="secondary" onClick={() => void query.refetch()}>
              Erneut versuchen
            </Button>
          }
        />
      ) : !item ? (
        <div className="item-detail" role="status" aria-busy="true" aria-label="Artikel wird geladen …">
          <Skeleton width={168} height={168} radius={38} className="item-detail__image" />
          <Skeleton shape="text" width={220} height={28} className="item-detail__skeleton-title" />
          <Skeleton shape="text" width={96} height={28} className="item-detail__skeleton-tag" />
        </div>
      ) : null}

      {item ? (
        <ContextMenu
          open={menuAnchor !== null}
          anchorRect={menuAnchor}
          items={actions.menuItems(item)}
          label={item.name}
          onClose={() => setMenuAnchor(null)}
        />
      ) : null}
      {actions.dialog}
    </Screen>
  );
}
