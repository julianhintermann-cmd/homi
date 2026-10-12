import { QueryClient } from '@tanstack/react-query';
import { isApiError, setUnauthorizedHandler } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';

const MAX_RETRIES = 2;

/** Never retry client errors (4xx – auth, validation, not found, conflicts); retry transient failures twice. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
  return failureCount < MAX_RETRIES;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Realtime `sync` events invalidate data, so a moderate staleTime avoids refetch storms.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: shouldRetryQuery,
        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
        refetchOnReconnect: true,
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

/** The app-wide client (tests create their own via `createQueryClient`). */
export const queryClient = createQueryClient();

/**
 * Wires the API client's 401 handling to the cache: the session is gone, so `['me']` is
 * refetched (→ `null`) and the route guards redirect to /login.
 */
export function bindApiClientToQueryClient(client: QueryClient): () => void {
  setUnauthorizedHandler(() => {
    void client.invalidateQueries({ queryKey: queryKeys.me });
  });
  return () => setUnauthorizedHandler(null);
}
