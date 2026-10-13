import { queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import type { LoginRequest, MeResponse, RegisterRequest } from '@homi/shared';
import { fetchAuthConfig, fetchMe, login, logout, register } from '@/api/auth';
import { isApiError } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { disconnectSocket } from '@/lib/socket';

/**
 * Session UI state. `explicitLogout` lets the auth guard send the user to a plain /login
 * after "Abmelden" (no `?redirect=` back to the page they logged out from).
 */
interface SessionUiState {
  explicitLogout: boolean;
  setExplicitLogout: (value: boolean) => void;
}

export const useSessionUiStore = create<SessionUiState>()((set) => ({
  explicitLogout: false,
  setExplicitLogout: (explicitLogout) => set({ explicitLogout }),
}));

export const meQueryOptions = queryOptions({
  queryKey: queryKeys.me,
  queryFn: ({ signal }) => fetchMe(signal),
  staleTime: 60_000,
});

/** `data`: `MeResponse` when logged in, `null` when not, `undefined` while unknown. */
export function useMe() {
  return useQuery(meQueryOptions);
}

export function useAuthConfig() {
  return useQuery({
    queryKey: ['auth-config'] as const,
    queryFn: ({ signal }) => fetchAuthConfig(signal),
    staleTime: Infinity,
  });
}

// ---------------------------------------------------------------------------
// Session transitions (login, registration, logout, password reset)
// ---------------------------------------------------------------------------

const isSessionKey = (queryKey: readonly unknown[]): boolean => queryKey[0] === queryKeys.me[0];

/**
 * Replaces the cached session with `me` (`null` = signed out) – race-free:
 *
 * 1. In-flight requests are cancelled first and **awaited**: a `/auth/me` refetch started before the
 *    login would otherwise land afterwards (or revert the cancelled query's state) and overwrite the
 *    new session with `null`; a data request of the previous user could repopulate the cache.
 * 2. Every query except `['me']` is removed – no data of a previous user survives.
 * 3. `['me']` is updated **in place**. `queryClient.clear()` must not be used: it removes the query
 *    that mounted observers (route guards, `AppRuntime`) are attached to, so they would never see the
 *    new session (no redirect after login/logout, no socket (re)connect).
 */
export async function replaceSession(client: QueryClient, me: MeResponse | null): Promise<void> {
  await client.cancelQueries();
  client.removeQueries({ predicate: (query) => !isSessionKey(query.queryKey) });
  client.setQueryData<MeResponse | null>(queryKeys.me, me);
}

async function startSession(client: QueryClient, me: MeResponse): Promise<void> {
  useSessionUiStore.getState().setExplicitLogout(false);
  await replaceSession(client, me);
}

/** Local sign-out: no `?redirect=` back to the screen the user left, socket closed, data dropped. */
export async function endSession(client: QueryClient): Promise<void> {
  useSessionUiStore.getState().setExplicitLogout(true);
  disconnectSocket();
  await replaceSession(client, null);
}

/**
 * After a password reset every session of that account is revoked server-side. Drop the local
 * session data and re-check `/auth/me` (a different account may still be signed in).
 */
export async function resetSessionAfterPasswordReset(client: QueryClient): Promise<void> {
  disconnectSocket();
  await replaceSession(client, null);
  void client.invalidateQueries({ queryKey: queryKeys.me, refetchType: 'all' });
}

/** `POST /api/auth/login`; the `PublicOnly` guard then continues to `?redirect=` or Home. */
export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) => login(body),
    onSuccess: (me) => startSession(client, me),
  });
}

/** `POST /api/auth/register` (signs the new account in). */
export function useRegister() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterRequest) => register(body),
    onSuccess: (me) => startSession(client, me),
  });
}

/**
 * Logs out on the server, then drops every cached query and the socket. If the request fails
 * (e.g. offline) the session is kept – the HttpOnly cookie would otherwise silently stay
 * valid – and the error is exposed via the mutation state. A 401 means already logged out.
 */
export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => logout(),
    onSuccess: () => endSession(client),
    onError: async (error) => {
      if (isApiError(error) && error.status === 401) await endSession(client);
    },
  });
}
