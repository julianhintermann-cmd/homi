import type { ShoppingItemDto } from '@homi/shared';
import { ShoppingItemRow, SwipeableRow } from '@/components';
import { itemDetailText } from './draft';
import { SHOPPING_ROW_ATTRIBUTE } from './rowFocus';
import { shoppingSwipeActions } from './swipe';

export interface ShoppingRowProps {
  item: ShoppingItemDto;
  /** Shown as completed (also while a just-ticked row still plays its check in place). */
  checked: boolean;
  /** Fade in on insertion (rows that were not on screen when the list was opened). */
  animateIn?: boolean;
  onToggle: (item: ShoppingItemDto, completed: boolean) => void;
  onEdit: (item: ShoppingItemDto) => void;
  onDelete: (item: ShoppingItemDto) => void;
}

/**
 * One shopping row: checkbox toggles, tapping the row opens the edit sheet, swipe right ticks off
 * (or restores), swipe left deletes. Long press / right-click offer the same actions.
 */
export function ShoppingRow({ item, checked, animateIn = false, onToggle, onEdit, onDelete }: ShoppingRowProps) {
  const swipe = shoppingSwipeActions(checked, {
    onComplete: () => onToggle(item, true),
    onRestore: () => onToggle(item, false),
    onDelete: () => onDelete(item),
  });
  return (
    <SwipeableRow
      className={animateIn ? 'shopping-row-enter' : undefined}
      menuLabel={item.name}
      menuItems={[{ key: 'edit', label: 'Bearbeiten', icon: 'pencil', onSelect: () => onEdit(item) }]}
      actions={swipe.trailing}
      leadingActions={swipe.leading}
    >
      {/* Layout-neutral (display: contents) anchor: lets the screen find the row's checkbox again. */}
      <div className="shopping-row" {...{ [SHOPPING_ROW_ATTRIBUTE]: item.id }}>
        <ShoppingItemRow
          wrapper="div"
          name={item.name}
          quantity={itemDetailText(item)}
          completed={checked}
          onCompletedChange={(next) => onToggle(item, next)}
          onPress={() => onEdit(item)}
        />
      </div>
    </SwipeableRow>
  );
}
