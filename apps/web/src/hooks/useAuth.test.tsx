import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider, useQuery, type QueryClient } from '@tanstack/react-query';
import type { MeResponse } from '@homi/shared';
import { queryKeys } from '@/api/queryKeys';
import { createQueryClient } from '@/lib/queryClient';
import { useLogin, useLogout, useMe, useSessionUiStore } from './useAuth';

/*
 * Session transitions (integration finding): `queryClient.clear()` detached mounted `['me']`
 * observers (guards, AppRuntime) – no redirect after login, no socket connect – and an in-flight
 * `/auth/me` that started before the login could overwrite the new session with `null`.
 */

const HID = '5b0c2f5e-6c0b-4c55-9d43-0d3f3c2b1a10';
const ME: MeResponse = {
  user: {
    id: '8e0a1c0e-1d7b-4a43-8f5e-2f0c9b7d6a11',
    displayName: 'Julia',
    email: 'j@example.ch',
    createdAt: '2026-10-01T08:00:00.000Z',
  },
  households: [{ id: HID, name: 'WG Basel', role: 'OWNER', memberCount: 1 }],
  activeHouseholdId: HID,
};

function json(status: number, body?: unknown): Response {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body ?? {}), { status, headers: { 'Content-Type': 'application/json' } });
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

interface SessionActionsHandle {
  login: ReturnType<typeof useLogin>;
  logout: ReturnType<typeof useLogout>;
}
const handle: { current: SessionActionsHandle | null } = { current: null };

/** The login/logout screens (they re-render with their mutation state). */
function SessionActions() {
  const login = useLogin();
  const logout = useLogout();
  useEffect(() => {
    handle.current = { login, logout };
  });
  return null;
}

/**
 * Stands in for a route guard / AppRuntime: an observer of `['me']` that stays mounted and does
 * not re-render on its own (it must be notified through the query it is attached to).
 */
function SessionProbe() {
  const { data } = useMe();
  const dashboard = useQuery({ queryKey: queryKeys.dashboard(HID), queryFn: () => 'dashboard', enabled: false });
  return (
    <p>
      {data === undefined ? 'unknown' : data === null ? 'anonymous' : `signed in as ${data.user.displayName}`}
      {dashboard.data ? ` · ${dashboard.data}` : ''}
    </p>
  );
}

function renderProbe(client: QueryClient) {
  render(
    <QueryClientProvider client={client}>
      <SessionProbe />
      <SessionActions />
    </QueryClientProvider>,
  );
}

beforeEach(() => useSessionUiStore.setState({ explicitLogout: false }));
afterEach(() => {
  vi.unstubAllGlobals();
  handle.current = null;
});

describe('session transitions', () => {
  it('login updates the mounted ["me"] observer in place', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url === '/api/auth/login' ? json(200, ME) : json(401))),
    );
    const client = createQueryClient();
    client.setQueryData(queryKeys.me, null);
    renderProbe(client);
    expect(screen.getByText('anonymous')).toBeInTheDocument();

    await act(() => handle.current!.login.mutateAsync({ email: 'j@example.ch', password: 'Passwort-123' }));
    expect(await screen.findByText('signed in as Julia')).toBeInTheDocument();
  });

  it('an /auth/me request that was in flight before the login cannot sign the user out again', async () => {
    const staleMe = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/auth/me') return staleMe.promise; // started before the session cookie existed
        if (url === '/api/auth/login') return json(200, ME);
        return json(404);
      }),
    );
    const client = createQueryClient();
    client.setQueryData(queryKeys.me, null);
    renderProbe(client);
    void client.refetchQueries({ queryKey: queryKeys.me });
    await waitFor(() => expect(client.getQueryState(queryKeys.me)?.fetchStatus).toBe('fetching'));

    await act(() => handle.current!.login.mutateAsync({ email: 'j@example.ch', password: 'Passwort-123' }));
    await act(async () => {
      staleMe.resolve(json(401, { error: { code: 'UNAUTHORIZED', message: 'Bitte melde dich an.' } }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(client.getQueryData(queryKeys.me)).toEqual(ME);
    expect(await screen.findByText('signed in as Julia')).toBeInTheDocument();
  });

  it('logout drops every other cached query but keeps the ["me"] observer attached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url === '/api/auth/logout' ? json(204) : json(401))),
    );
    const client = createQueryClient();
    client.setQueryData(queryKeys.me, ME);
    client.setQueryData(queryKeys.dashboard(HID), 'dashboard');
    client.setQueryData(queryKeys.shopping(HID), { open: [] });
    renderProbe(client);
    expect(screen.getByText('signed in as Julia · dashboard')).toBeInTheDocument();

    await act(() => handle.current!.logout.mutateAsync());
    expect(await screen.findByText('anonymous')).toBeInTheDocument();
    expect(client.getQueryData(queryKeys.shopping(HID))).toBeUndefined();
    expect(client.getQueryData(queryKeys.dashboard(HID))).toBeUndefined();
    expect(useSessionUiStore.getState().explicitLogout).toBe(true);
  });
});
