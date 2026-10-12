import { createContext, useCallback, useContext } from 'react';
import { createPath, matchPath, useLocation, useNavigate, type Location } from 'react-router';
import { paths } from './paths';

/* ────────────────────────────────────────────────────────────────────────────
 * Modal sheet routes (`/inventar/neu`, `/inventar/:id/bearbeiten`)
 *
 * Opening a sheet pushes its URL with `state.backgroundLocation = <current location>`;
 * the app renders the background location underneath and the sheet on top. Deep links
 * (no state) get a synthetic background: the inventory list or the item detail.
 * ──────────────────────────────────────────────────────────────────────────── */

export type SheetMatch = { kind: 'inventory-new' } | { kind: 'inventory-edit'; itemId: string };

export interface SheetLocationState {
  backgroundLocation?: Location;
}

const SHEET_PATTERNS = {
  'inventory-new': '/inventar/neu',
  'inventory-edit': '/inventar/:id/bearbeiten',
} as const;

export function matchSheetRoute(pathname: string): SheetMatch | null {
  if (matchPath({ path: SHEET_PATTERNS['inventory-new'], end: true }, pathname)) return { kind: 'inventory-new' };
  const edit = matchPath({ path: SHEET_PATTERNS['inventory-edit'], end: true }, pathname);
  if (edit?.params.id) return { kind: 'inventory-edit', itemId: edit.params.id };
  return null;
}

/** Where a sheet opened via deep link "comes from" (and returns to when closed). */
export function sheetFallbackPath(sheet: SheetMatch): string {
  return sheet.kind === 'inventory-new' ? paths.inventory : paths.inventoryItem(sheet.itemId);
}

function isLocation(value: unknown): value is Location {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Location).pathname === 'string' &&
    typeof (value as Location).search === 'string'
  );
}

/** The validated background location from `location.state`, if any. */
export function getBackgroundLocation(state: unknown): Location | null {
  if (typeof state !== 'object' || state === null) return null;
  const background = (state as SheetLocationState).backgroundLocation;
  // A sheet must never be the background of another sheet.
  return isLocation(background) && !matchSheetRoute(background.pathname) ? background : null;
}

/** A synthetic location object for a deep-linked sheet's background. */
export function createFallbackLocation(pathname: string): Location {
  return { pathname, search: '', hash: '', state: null, key: `sheet-fallback:${pathname}` };
}

/** Navigation state for links that open a sheet over the current screen. */
export function sheetLinkState(current: Location): SheetLocationState {
  return { backgroundLocation: getBackgroundLocation(current.state) ?? current };
}

/** Opens a sheet route over the current screen: `openSheet(paths.inventoryNew)`. */
export function useOpenSheet(): (to: string) => void {
  const navigate = useNavigate();
  const location = useRealLocation();
  return useCallback((to: string) => void navigate(to, { state: sheetLinkState(location) }), [location, navigate]);
}

/**
 * Closes the current sheet: back to the screen it was opened from, or – after a deep link –
 * replace with the fallback screen. Pass `to` to leave the sheet towards another page
 * (e.g. the created item), replacing the sheet entry.
 */
export function useCloseSheet(): (to?: string) => void {
  const navigate = useNavigate();
  const location = useRealLocation();
  return useCallback(
    (to?: string) => {
      const sheet = matchSheetRoute(location.pathname);
      const background = getBackgroundLocation(location.state);
      if (to) {
        void navigate(to, { replace: true });
      } else if (background && hasInAppHistory()) {
        void navigate(-1);
      } else {
        const target = background ? createPath(background) : sheet ? sheetFallbackPath(sheet) : paths.home;
        void navigate(target, { replace: true });
      }
    },
    [location, navigate],
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Real location
 *
 * The background screens render inside `<Routes location={background}>`, which makes
 * `useLocation()` return the background location there. Guards and sheet helpers need the
 * URL that is actually in the address bar.
 * ──────────────────────────────────────────────────────────────────────────── */

export const RealLocationContext = createContext<Location | null>(null);

export function useRealLocation(): Location {
  const routed = useLocation();
  return useContext(RealLocationContext) ?? routed;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Back navigation for pushed screens
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Goes back in history when the screen was reached inside the app, otherwise (deep link,
 * fresh tab) replaces with `fallback` – a PWA has no browser back button to rescue the user.
 */
export function useGoBack(fallback: string): () => void {
  const navigate = useNavigate();
  return useCallback(() => {
    if (hasInAppHistory()) void navigate(-1);
    else void navigate(fallback, { replace: true });
  }, [fallback, navigate]);
}

/**
 * `true` when the current history entry was pushed by the app, i.e. "back" stays inside Homi.
 * React Router's browser history stores the stack position as `history.state.idx` (0 for the
 * entry the app was opened with; preserved across reloads and replace navigations).
 */
export function hasInAppHistory(): boolean {
  const state: unknown = window.history.state;
  const idx = typeof state === 'object' && state !== null ? (state as { idx?: unknown }).idx : undefined;
  return typeof idx === 'number' && idx > 0;
}
