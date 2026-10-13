import { useCallback, useLayoutEffect, useRef } from 'react';

/*
 * Keyboard / screen-reader focus for rows that change section. "Offen" and "Erledigt" are two
 * lists, so ticking off (or restoring) an item unmounts its row – and the focused checkbox with
 * it – and mounts it in the other list; the browser would drop focus to <body>. The screen
 * captures the focus right before the toggle and, in the commit that removes the old row, puts it
 * on the item's checkbox at its new place – or, when that is not rendered (collapsed "Erledigt"),
 * on the next row of the section it left, then the previous one, then the "Erledigt · n" toggle,
 * then the add row.
 */

/** Attribute on each row's wrapper: the item id. */
export const SHOPPING_ROW_ATTRIBUTE = 'data-shopping-item';

/** Safety net only – the request resolves in the commit that moves the row. */
const REQUEST_TTL_MS = 5000;

interface FocusRequest {
  row: Element;
  itemId: string;
  /** Rows to try when the item is not rendered any more (next ones first, then previous ones). */
  fallbacks: readonly string[];
  /** Focus came from the keyboard (focus ring visible): the new target is scrolled into view. */
  keyboard: boolean;
  at: number;
}

function rowElement(itemId: string): Element | null {
  for (const element of document.querySelectorAll(`[${SHOPPING_ROW_ATTRIBUTE}]`)) {
    if (element.getAttribute(SHOPPING_ROW_ATTRIBUTE) === itemId) return element;
  }
  return null;
}

function rowCheckbox(itemId: string): HTMLInputElement | null {
  return rowElement(itemId)?.querySelector<HTMLInputElement>('input[type="checkbox"]') ?? null;
}

function hasVisibleFocus(element: Element): boolean {
  try {
    return element.matches(':focus-visible');
  } catch {
    return true; // engines without :focus-visible: assume keyboard
  }
}

function focusLost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || !active.isConnected;
}

/**
 * Returns `capture(itemId, sectionIds)`: call it right before the item changes section, with the
 * ids of the section it is in (in display order). Does nothing unless the focus is inside that
 * row (or in a menu opened from it), so pointer and touch use never moves or scrolls anything.
 */
export function useKeepRowFocus(): (itemId: string, sectionIds: readonly string[]) => void {
  const request = useRef<FocusRequest | null>(null);

  const capture = useCallback((itemId: string, sectionIds: readonly string[]) => {
    const row = rowElement(itemId);
    const active = document.activeElement;
    const inRow = row !== null && active !== null && row.contains(active);
    const inMenu = active?.closest('[role="menu"]') != null;
    if (!row || (!inRow && !inMenu)) {
      request.current = null;
      return;
    }
    const index = sectionIds.indexOf(itemId);
    const fallbacks = index < 0 ? [] : [...sectionIds.slice(index + 1), ...sectionIds.slice(0, index).reverse()];
    request.current = {
      row,
      itemId,
      fallbacks,
      keyboard: inRow && active ? hasVisibleFocus(active) : true,
      at: Date.now(),
    };
  }, []);

  // Runs after every commit of the screen; cheap unless a request is pending.
  useLayoutEffect(() => {
    const pending = request.current;
    if (!pending) return;
    if (Date.now() - pending.at > REQUEST_TTL_MS) {
      request.current = null;
      return;
    }
    if (pending.row.isConnected) return; // still in place (the tick plays before the row moves)
    request.current = null;
    if (!focusLost()) return; // the user already moved on
    const target: HTMLElement | null =
      rowCheckbox(pending.itemId) ??
      pending.fallbacks.map(rowCheckbox).find((checkbox) => checkbox !== null) ??
      document.querySelector<HTMLElement>('.shopping-completed__toggle') ??
      document.querySelector<HTMLElement>('.shopping-add-row__input');
    if (!target) return;
    // Keyboard: bring the new place into view (focus() scrolls); pointer: never scroll the list.
    target.focus({ preventScroll: !pending.keyboard });
  });

  return capture;
}
