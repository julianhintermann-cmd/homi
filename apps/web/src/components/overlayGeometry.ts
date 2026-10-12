import { clamp } from './utils';

/** Plain-object anchor box (a `DOMRect` works). */
export interface AnchorRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface MenuPlacement {
  top: number;
  left: number;
  /** Which edge the menu grows from (transform origin). */
  origin: 'top' | 'bottom';
}

export const CONTEXT_MENU_WIDTH = 250;
const MENU_GAP = 12;
const VIEWPORT_EDGE = 16;

/**
 * Context-menu position (FIDELITY §4.4 / screen 16): right-aligned with the anchor, 12 px below
 * it; above the anchor when there is no room below; clamped into the safe viewport otherwise.
 */
export function placeContextMenu(
  anchor: AnchorRect,
  menuHeight: number,
  viewport: { width: number; height: number },
  insets: { top: number; bottom: number } = { top: 0, bottom: 0 },
): MenuPlacement {
  const width = Math.min(CONTEXT_MENU_WIDTH, viewport.width - 2 * VIEWPORT_EDGE);
  const left = clamp(anchor.right - width, VIEWPORT_EDGE, viewport.width - VIEWPORT_EDGE - width);
  const minTop = insets.top + 8;
  const maxBottom = viewport.height - insets.bottom - 8;
  const below = anchor.bottom + MENU_GAP;
  if (below + menuHeight <= maxBottom) return { top: below, left, origin: 'top' };
  const above = anchor.top - MENU_GAP - menuHeight;
  if (above >= minTop) return { top: above, left, origin: 'bottom' };
  return { top: clamp(below, minTop, Math.max(minTop, maxBottom - menuHeight)), left, origin: 'top' };
}

/** Resolved `--safe-top` / `--safe-bottom` in px (they may be `env()` expressions). */
export function readSafeInsets(): { top: number; bottom: number } {
  if (typeof document === 'undefined' || !document.body) return { top: 0, bottom: 0 };
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;top:0;left:0;padding-top:var(--safe-top);padding-bottom:var(--safe-bottom)';
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const insets = { top: parseFloat(style.paddingTop) || 0, bottom: parseFloat(style.paddingBottom) || 0 };
  probe.remove();
  return insets;
}

/** Indexes of menu items that start a new group (9 px band): explicit or first destructive item. */
export function menuGroupStarts(items: readonly { destructive?: boolean; separatorBefore?: boolean }[]): Set<number> {
  const starts = new Set<number>();
  items.forEach((item, index) => {
    if (index === 0) return;
    const previous = items[index - 1];
    if (item.separatorBefore || (item.destructive && !previous?.destructive)) starts.add(index);
  });
  return starts;
}
