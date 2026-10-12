import { Suspense, useState } from 'react';
import { Route, Routes, type Location } from 'react-router';
import { HomiBottomSheet } from '@/components/HomiBottomSheet';
import { useMe } from '@/hooks/useAuth';
import { InventoryEditSheetPage } from './lazyPages';
import { matchSheetRoute, useCloseSheet } from './navigation';
import { ScreenErrorBoundary } from './RouteErrorBoundary';
import { RouteFallback } from './RouteFallback';
import { SheetDirtyContext } from './sheetDirty';

export interface SheetLayerProps {
  /** The sheet's own location (kept by `AnimatePresence` while the sheet animates out). */
  location: Location;
}

/**
 * Modal sheet routes rendered over the background screen. Only shown for signed-in users
 * with a household – otherwise the background route's guard redirects.
 * Sheet pages report unsaved input with `useSheetDirty(dirty)` (see `sheetDirty.ts`).
 */
export function SheetLayer({ location }: SheetLayerProps) {
  const { data: me } = useMe();
  const closeSheet = useCloseSheet();
  const [dirty, setDirty] = useState(false);
  if (!me || me.households.length === 0) return null;

  const sheet = matchSheetRoute(location.pathname);
  const label = sheet?.kind === 'inventory-edit' ? 'Artikel bearbeiten' : 'Artikel hinzufügen';

  return (
    <HomiBottomSheet onClose={() => closeSheet()} aria-label={label} dirty={dirty}>
      <SheetDirtyContext.Provider value={setDirty}>
        <ScreenErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<RouteFallback />}>
            <Routes location={location}>
              <Route path="/inventar/neu" element={<InventoryEditSheetPage mode="new" />} />
              <Route path="/inventar/:id/bearbeiten" element={<InventoryEditSheetPage mode="edit" />} />
            </Routes>
          </Suspense>
        </ScreenErrorBoundary>
      </SheetDirtyContext.Provider>
    </HomiBottomSheet>
  );
}
