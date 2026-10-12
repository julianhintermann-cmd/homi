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

/** Replaces every cached query with a fresh session (no data of a previous user survives). */
function startSession(client: QueryClient, me: MeResponse): void {
  client.clear();
  client.setQueryData(queryKeys.me, me);
  useSessionUiStore.getState().setExplicitLogout(false);
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) => login(body),
    onSuccess: (me) => startSession(client, me),
  });
}

export function useRegister() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterRequest) => register(body),
    onSuccess: (me) => startSession(client, me),
  });
}

function endSession(client: QueryClient): void {
  useSessionUiStore.getState().setExplicitLogout(true);
  disconnectSocket();
  client.clear();
  client.setQueryData<MeResponse | null>(queryKeys.me, null);
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
    onError: (error) => {
      if (isApiError(error) && error.status === 401) endSession(client);
    },
  });
}
