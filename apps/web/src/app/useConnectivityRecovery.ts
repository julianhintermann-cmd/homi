import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { api } from '@/api/client';
import { useConnectivityStore } from '@/lib/connectivity';

/** Probe interval while the browser is online but the Homi server did not answer. */
const PROBE_INTERVAL_MS = 10_000;

/**
 * Recovers from "server unreachable": probes `/api/health` until the server answers again
 * (any HTTP response marks it reachable in the API client) and then refetches the queries
 * that failed in the meantime. Browser offline → online is handled by TanStack Query's
 * `refetchOnReconnect`.
 */
export function useConnectivityRecovery(): void {
  const client = useQueryClient();
  const { browserOnline, serverReachable } = useConnectivityStore(
    useShallow((s) => ({ browserOnline: s.browserOnline, serverReachable: s.serverReachable })),
  );

  useEffect(() => {
    if (!browserOnline || serverReachable) return undefined;
    const probe = (): void => {
      api.get('/api/health', { skipUnauthorizedHandler: true }).catch(() => undefined);
    };
    const interval = window.setInterval(probe, PROBE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [browserOnline, serverReachable]);

  useEffect(
    () =>
      useConnectivityStore.subscribe((state, previous) => {
        if (state.serverReachable && !previous.serverReachable) {
          void client.refetchQueries({ type: 'active', predicate: (query) => query.state.status === 'error' });
        }
      }),
    [client],
  );
}
