import { useCallback, useState, type ReactNode } from 'react';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import type { AnchorRect } from './overlayGeometry';
import { useLongPress, type LongPressDetail, type LongPressHandlers } from './useLongPress';

export interface RowMenu<T extends HTMLElement> {
  /** Spread onto the pressable element (long press, right-click, Shift+F10). */
  handlers: LongPressHandlers<T> | undefined;
  /** The menu overlay – render it next to the row. */
  menu: ReactNode;
  open: boolean;
  /** Opens the menu programmatically for an element (e.g. from a swipe-action fallback). */
  openFor: (element: HTMLElement) => void;
}

function toAnchor(rect: DOMRect): AnchorRect {
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Long-press context menu for list rows (design 16): opens a `ContextMenu` anchored to the row
 * with a lifted preview of it. Returns nothing interactive when `items` is empty.
 */
export function useRowMenu<T extends HTMLElement>(
  items: readonly ContextMenuItem[] | undefined,
  renderPreview?: () => ReactNode,
  label?: string,
): RowMenu<T> {
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const enabled = Boolean(items && items.length > 0);
  const onLongPress = useCallback((detail: LongPressDetail) => setAnchor(toAnchor(detail.rect)), []);
  const handlers = useLongPress<T>(onLongPress, { disabled: !enabled });
  const openFor = useCallback((element: HTMLElement) => setAnchor(toAnchor(element.getBoundingClientRect())), []);

  const menu =
    enabled && items ? (
      <ContextMenu
        open={anchor !== null}
        anchorRect={anchor}
        items={items}
        label={label}
        preview={anchor && renderPreview ? renderPreview() : undefined}
        onClose={() => setAnchor(null)}
      />
    ) : null;

  return { handlers: enabled ? handlers : undefined, menu, open: anchor !== null, openFor };
}
