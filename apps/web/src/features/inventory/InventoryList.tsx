import { memo, useRef } from 'react';
import type { InventoryItemDto } from '@homi/shared';
import { Button, InventoryItemRow, Spinner, SwipeableRow, type ContextMenuItem, type SwipeAction } from '@/components';
import { useScrollContainer } from '@/hooks/useScrollMemory';
import { paths } from '@/routes/paths';
import { itemSubtitle, itemTotalLabel, itemUnitPriceLabel } from './format';
import { useInfiniteScroll } from './hooks';
import type { ItemActions } from './useItemActions';

export interface InventoryListProps {
  items: readonly InventoryItemDto[];
  actions: Pick<ItemActions, 'menuItems' | 'edit' | 'askDelete'>;
  highlightedId: string | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

/**
 * The inventory card of design 02: 76 px rows (swipe left → Bearbeiten / Löschen, long press or
 * right-click → context menu of design 16) with infinite scrolling below.
 */
export function InventoryList({
  items,
  actions,
  highlightedId,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: InventoryListProps) {
  const sentinel = useRef<HTMLDivElement>(null);
  const scroller = useScrollContainer();
  useInfiniteScroll(sentinel, scroller, hasNextPage && !isFetchingNextPage, onLoadMore);

  return (
    <>
      <ul className="homi-card inventory-list" role="list" aria-label="Artikel">
        {items.map((item) => (
          <InventoryListRow
            key={item.id}
            item={item}
            highlighted={item.id === highlightedId}
            menuItems={actions.menuItems(item)}
            onEdit={actions.edit}
            onDelete={actions.askDelete}
          />
        ))}
      </ul>
      {hasNextPage ? (
        <div ref={sentinel} className="inventory-list__more">
          {isFetchingNextPage ? (
            <span role="status" aria-label="Weitere Artikel werden geladen">
              <Spinner size={22} />
            </span>
          ) : (
            <Button variant="plain" onClick={onLoadMore}>
              Weitere Artikel laden
            </Button>
          )}
        </div>
      ) : null}
    </>
  );
}

interface InventoryListRowProps {
  item: InventoryItemDto;
  highlighted: boolean;
  menuItems: ContextMenuItem[];
  onEdit: (item: InventoryItemDto) => void;
  onDelete: (item: InventoryItemDto) => void;
}

const InventoryListRow = memo(function InventoryListRow({
  item,
  highlighted,
  menuItems,
  onEdit,
  onDelete,
}: InventoryListRowProps) {
  const swipeActions: SwipeAction[] = [
    { key: 'delete', label: 'Löschen', icon: 'trash', tone: 'destructive', onAction: () => onDelete(item) },
    { key: 'edit', label: 'Bearbeiten', icon: 'pencil', tone: 'neutral', onAction: () => onEdit(item) },
  ];
  return (
    <SwipeableRow actions={swipeActions} menuItems={menuItems} actionsInMenu={false} menuLabel={item.name}>
      <InventoryItemRow
        wrapper="div"
        name={item.name}
        subtitle={itemSubtitle(item)}
        price={itemTotalLabel(item)}
        unitPrice={itemUnitPriceLabel(item)}
        imageUrl={item.image?.thumbUrl ?? null}
        to={paths.inventoryItem(item.id)}
        highlighted={highlighted}
      />
    </SwipeableRow>
  );
});
