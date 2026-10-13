import type { SwipeAction } from '@/components';

/*
 * Swipe actions of a shopping row (iOS Reminders style):
 * - left → right (leading): "Erledigt" on open rows, "Wiederherstellen" on completed rows;
 *   a full swipe triggers it.
 * - right → left (trailing): "Löschen"; a full swipe deletes.
 * The same actions are offered by long press / right-click / Shift+F10 (SwipeableRow menu).
 *
 * "Wiederherstellen" does not fit the 76 px action on one line: it carries a soft hyphen (two lines
 * "Wieder-" / "herstellen", invisible elsewhere, ignored by screen readers) and no icon, so both
 * lines fit the 52 px row.
 */

/** "Wieder­herstellen" with a soft hyphen (U+00AD) as the only break opportunity. */
export const RESTORE_LABEL = 'Wieder\u00ADherstellen';

export interface ShoppingSwipeHandlers {
  onComplete: () => void;
  onRestore: () => void;
  onDelete: () => void;
}

export interface ShoppingSwipeActions {
  leading: SwipeAction[];
  trailing: SwipeAction[];
}

export function shoppingSwipeActions(completed: boolean, handlers: ShoppingSwipeHandlers): ShoppingSwipeActions {
  const leading: SwipeAction = completed
    ? { key: 'restore', label: RESTORE_LABEL, tone: 'neutral', onAction: handlers.onRestore }
    : { key: 'complete', label: 'Erledigt', icon: 'check', tone: 'accent', onAction: handlers.onComplete };
  return {
    leading: [leading],
    trailing: [{ key: 'delete', label: 'Löschen', icon: 'trash', tone: 'destructive', onAction: handlers.onDelete }],
  };
}
