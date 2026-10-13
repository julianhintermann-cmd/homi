import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { MeResponse } from '@homi/shared';
import { AppRoutes } from '@/App';
import { networkError } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { useSessionUiStore } from '@/hooks/useAuth';
import { createQueryClient } from '@/lib/queryClient';
import { loginPathWithRedirect, safeRedirectTarget } from './paths';
import { deriveSessionStatus } from './session';

const HOUSEHOLD_ID = '5b0c2f5e-6c0b-4c55-9d43-0d3f3c2b1a10';

const ME: MeResponse = {
  user: {
    id: '8e0a1c0e-1d7b-4a43-8f5e-2f0c9b7d6a11',
    displayName: 'Julia',
    email: 'julia@example.ch',
    createdAt: '2026-10-01T08:00:00.000Z',
  },
  households: [{ id: HOUSEHOLD_ID, name: 'WG Basel', role: 'OWNER', memberCount: 3 }],
  activeHouseholdId: HOUSEHOLD_ID,
};

function renderAt(
  path: string,
  me: MeResponse | null,
): { router: ReturnType<typeof createMemoryRouter>; client: QueryClient } {
  const client = createQueryClient();
  client.setQueryData(queryKeys.me, me);
  client.setDefaultOptions({ queries: { staleTime: Infinity, retry: false } });
  const router = createMemoryRouter([{ path: '*', Component: AppRoutes }], { initialEntries: [path] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, client };
}

function currentUrl(router: ReturnType<typeof createMemoryRouter>): string {
  const { pathname, search } = router.state.location;
  return `${pathname}${search}`;
}

beforeEach(() => {
  // No network in guard tests: every unexpected request fails loudly.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('unexpected fetch in test');
    }),
  );
  useSessionUiStore.setState({ explicitLogout: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RequireAuth', () => {
  it('redirects anonymous users to /login with the original URL as ?redirect=', async () => {
    const { router } = renderAt('/inventar?kategorie=KUECHE', null);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toBe(`?redirect=${encodeURIComponent('/inventar?kategorie=KUECHE')}`);
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
  });

  it('uses the sheet URL (not the background screen) as redirect target for deep-linked sheets', async () => {
    const { router } = renderAt('/inventar/neu', null);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toBe(`?redirect=${encodeURIComponent('/inventar/neu')}`);
  });

  it('sends users to a plain /login after an explicit logout', async () => {
    useSessionUiStore.setState({ explicitLogout: true });
    const { router } = renderAt('/profil', null);
    await waitFor(() => expect(currentUrl(router)).toBe('/login'));
  });

  it('renders the protected screen for a signed-in member', async () => {
    const { router } = renderAt('/einkauf', ME);
    expect(await screen.findByRole('heading', { name: 'Einkaufsliste' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/einkauf');
    expect(screen.getByRole('navigation', { name: 'Hauptnavigation' })).toBeInTheDocument();
  });

  it('shows a retry screen instead of redirecting when the session cannot be checked (offline)', async () => {
    const client = createQueryClient();
    client.setDefaultOptions({ queries: { retry: false } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const router = createMemoryRouter([{ path: '*', Component: AppRoutes }], { initialEntries: ['/inventar'] });
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/inventar');
  });
});

describe('RequireHousehold', () => {
  it('sends users without a household to /willkommen', async () => {
    const { router } = renderAt('/', { ...ME, households: [], activeHouseholdId: null });
    await waitFor(() => expect(router.state.location.pathname).toBe('/willkommen'));
    expect(await screen.findByRole('heading', { name: /Willkommen/ })).toBeInTheDocument();
  });
});

describe('PublicOnly', () => {
  it('forwards signed-in users to the validated redirect target', async () => {
    const { router } = renderAt(`/login?redirect=${encodeURIComponent('/chats')}`, ME);
    await waitFor(() => expect(router.state.location.pathname).toBe('/chats'));
  });

  it('never follows an open redirect', async () => {
    const { router } = renderAt(`/login?redirect=${encodeURIComponent('//evil.example/phish')}`, ME);
    await waitFor(() => expect(currentUrl(router)).toBe('/'));
  });

  it('shows the login page after the session ends', async () => {
    const { router, client } = renderAt('/', ME);
    expect(await screen.findByRole('heading', { name: 'Dein Zuhause.' })).toBeInTheDocument();
    act(() => {
      client.setQueryData(queryKeys.me, null);
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});

describe('redirect helpers', () => {
  it('safeRedirectTarget only allows same-origin app paths', () => {
    expect(safeRedirectTarget('/inventar/abc?x=1#y')).toBe('/inventar/abc?x=1#y');
    expect(safeRedirectTarget('https://evil.example')).toBe('/');
    expect(safeRedirectTarget('//evil.example')).toBe('/');
    expect(safeRedirectTarget('/\\evil.example')).toBe('/');
    expect(safeRedirectTarget('/login')).toBe('/');
    expect(safeRedirectTarget('/inventar\n')).toBe('/');
    expect(safeRedirectTarget(null, '/einkauf')).toBe('/einkauf');
  });

  it('loginPathWithRedirect omits the parameter for Home', () => {
    expect(loginPathWithRedirect({ pathname: '/', search: '', hash: '' })).toBe('/login');
    expect(loginPathWithRedirect({ pathname: '/haushalt', search: '?a=1', hash: '' })).toBe(
      '/login?redirect=%2Fhaushalt%3Fa%3D1',
    );
  });

  it('deriveSessionStatus treats a paused/failed session check as unreachable, not anonymous', () => {
    const base = { error: null, failureReason: null, fetchStatus: 'idle' as const };
    expect(deriveSessionStatus({ ...base, data: null }).kind).toBe('anonymous');
    expect(deriveSessionStatus({ ...base, data: ME }).kind).toBe('authenticated');
    expect(deriveSessionStatus({ ...base, data: undefined, fetchStatus: 'fetching' }).kind).toBe('loading');
    expect(deriveSessionStatus({ ...base, data: undefined, fetchStatus: 'paused' })).toEqual({
      kind: 'unreachable',
      offline: true,
    });
    expect(deriveSessionStatus({ ...base, data: undefined, error: networkError() })).toEqual({
      kind: 'unreachable',
      offline: true,
    });
  });
});
