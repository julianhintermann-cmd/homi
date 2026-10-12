import { useShallow } from 'zustand/react/shallow';
import { useConnectivityStore, type ConnectivityState } from '@/lib/connectivity';

export type OfflineReason = 'offline' | 'server-unreachable';

export interface ConnectivityStatus {
  isOnline: boolean;
  /** Why the app is offline, `null` while online. */
  reason: OfflineReason | null;
}

export function deriveConnectivityStatus({
  browserOnline,
  serverReachable,
}: Pick<ConnectivityState, 'browserOnline' | 'serverReachable'>): ConnectivityStatus {
  if (!browserOnline) return { isOnline: false, reason: 'offline' };
  if (!serverReachable) return { isOnline: false, reason: 'server-unreachable' };
  return { isOnline: true, reason: null };
}

/** Detailed connectivity (browser offline vs. server unreachable). */
export function useConnectivity(): ConnectivityStatus {
  const state = useConnectivityStore(
    useShallow((s) => ({ browserOnline: s.browserOnline, serverReachable: s.serverReachable })),
  );
  return deriveConnectivityStatus(state);
}

/** `true` while the browser is online and the Homi server answered the latest request. */
export function useOnlineStatus(): boolean {
  return useConnectivityStore((s) => s.browserOnline && s.serverReachable);
}
