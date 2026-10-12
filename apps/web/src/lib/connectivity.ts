import { create } from 'zustand';

/**
 * Connectivity as seen by the app: the browser's network flag plus whether the Homi server
 * actually answered recently. `api/client.ts` reports every fetch outcome here, so a dead
 * Wi-Fi or a down server both surface as "offline" in the app shell.
 */
export interface ConnectivityState {
  /** `navigator.onLine` (kept in sync with the `online` / `offline` events). */
  browserOnline: boolean;
  /** `false` after a request failed at the network level (or with 502/504) until one succeeds again. */
  serverReachable: boolean;
  /** Epoch ms of the last network-level failure, `null` if none. */
  lastFailureAt: number | null;
}

interface ConnectivityActions {
  setBrowserOnline: (online: boolean) => void;
  reportNetworkFailure: () => void;
  reportServerReachable: () => void;
}

const initialBrowserOnline = typeof navigator === 'undefined' ? true : navigator.onLine;

export const useConnectivityStore = create<ConnectivityState & ConnectivityActions>()((set, get) => ({
  browserOnline: initialBrowserOnline,
  serverReachable: true,
  lastFailureAt: null,
  setBrowserOnline: (online) => {
    if (get().browserOnline === online) return;
    // Coming back online: assume the server is reachable again until a request proves otherwise.
    set(online ? { browserOnline: true, serverReachable: true } : { browserOnline: false });
  },
  reportNetworkFailure: () => set({ serverReachable: false, lastFailureAt: Date.now() }),
  reportServerReachable: () => {
    if (!get().serverReachable) set({ serverReachable: true });
  },
}));

/** Non-React helpers for the API client. */
export const connectivity = {
  reportNetworkFailure: (): void => useConnectivityStore.getState().reportNetworkFailure(),
  reportServerReachable: (): void => useConnectivityStore.getState().reportServerReachable(),
  isOnline: (): boolean => {
    const { browserOnline, serverReachable } = useConnectivityStore.getState();
    return browserOnline && serverReachable;
  },
};

let listening = false;

/** Subscribes to the browser's `online` / `offline` events (idempotent). Returns an unsubscribe function. */
export function initConnectivityListeners(target: Window = window): () => void {
  if (listening) return () => undefined;
  listening = true;
  const update = (): void => useConnectivityStore.getState().setBrowserOnline(target.navigator.onLine);
  target.addEventListener('online', update);
  target.addEventListener('offline', update);
  update();
  return () => {
    target.removeEventListener('online', update);
    target.removeEventListener('offline', update);
    listening = false;
  };
}
