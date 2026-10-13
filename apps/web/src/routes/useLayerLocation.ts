import { createContext, useContext } from 'react';
import { useLocation, useNavigationType, type Location, type NavigationType } from 'react-router';

/**
 * The location a screen layer was rendered for.
 *
 * `<AnimatePresence>` keeps the *element* of a leaving layer, but React Router's `useLocation()` reads a context:
 * a layer that is animating out is re-rendered with the NEW location. For the tab shell that meant: pushing
 * `/chats/:cid` while the shell was leaving made the leaving shell resolve "no tab" → Home, flip its own tab
 * `AnimatePresence` to a Home layer (still holding the old Chats page) and show the chat list twice with the
 * wrong tab highlighted – and on slower machines the push never settled (e2e/navigation-race.spec.ts).
 *
 * `<LayerLocationProvider>` is part of the element a layer is created from, so the value it carries is frozen
 * while the layer leaves; components inside read it with {@link useLayerLocation} instead of `useLocation()`.
 */
export interface LayerLocationValue {
  location: Location;
  navigationType: NavigationType;
}

export const LayerLocationContext = createContext<LayerLocationValue | null>(null);

/** Location (and history action) of the layer the caller lives in; the router's current one outside a layer. */
export function useLayerLocation(): LayerLocationValue {
  const frozen = useContext(LayerLocationContext);
  const location = useLocation();
  const navigationType = useNavigationType();
  return frozen ?? { location, navigationType };
}
