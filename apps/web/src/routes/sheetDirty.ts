import { createContext, useContext, useEffect } from 'react';

/**
 * Bridge between a route sheet page (e.g. `InventoryEditSheetPage`) and the `HomiBottomSheet`
 * owned by `SheetLayer`: the page reports unsaved input, the sheet then asks
 * "Änderungen verwerfen?" before it is dismissed by drag, backdrop tap, Escape or the close button.
 *
 * Programmatic closes via `useCloseSheet()` (e.g. after a successful save) are never blocked.
 * Cancel buttons inside the page should call `useSheet()?.requestClose()` to get the same check.
 */
export const SheetDirtyContext = createContext<((dirty: boolean) => void) | null>(null);

/** Marks the surrounding route sheet as dirty while `dirty` is true. No-op outside a route sheet. */
export function useSheetDirty(dirty: boolean): void {
  const setDirty = useContext(SheetDirtyContext);
  useEffect(() => {
    if (!setDirty) return undefined;
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
}
