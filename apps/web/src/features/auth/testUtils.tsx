import { render } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import type { MeResponse } from '@homi/shared';
import { AppRoutes } from '@/App';
import { queryKeys } from '@/api/queryKeys';
import { createQueryClient } from '@/lib/queryClient';

/* Test helpers for the auth/account feature tests (not part of the app bundle). */

export const TEST_HOUSEHOLD_ID = '5b0c2f5e-6c0b-4c55-9d43-0d3f3c2b1a10';

export const TEST_ME: MeResponse = {
  user: {
    id: '8e0a1c0e-1d7b-4a43-8f5e-2f0c9b7d6a11',
    displayName: 'Julia',
    email: 'julia@example.ch',
    createdAt: '2026-10-01T08:00:00.000Z',
  },
  households: [{ id: TEST_HOUSEHOLD_ID, name: 'Unser Zuhause', role: 'OWNER', memberCount: 3 }],
  activeHouseholdId: TEST_HOUSEHOLD_ID,
};

export function jsonResponse(status: number, body?: unknown): Response {
  if (body === undefined) return new Response(null, { status });
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export interface RecordedRequest {
  method: string;
  url: string;
  body: unknown;
  headers: Headers;
}

export type FetchHandler = (request: RecordedRequest) => Response | Promise<Response>;

/** Stubs `fetch` with a router-like handler and records every request. */
export function stubFetch(handler: FetchHandler): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const request: RecordedRequest = {
        method: (init.method ?? 'GET').toUpperCase(),
        url: String(input),
        body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
        headers: new Headers(init.headers),
      };
      requests.push(request);
      return handler(request);
    }),
  );
  return requests;
}

export function apiError(status: number, code: string, message: string, details?: unknown): Response {
  return jsonResponse(status, { error: { code, message, ...(details === undefined ? {} : { details }) } });
}

/** Renders the real route tree (guards, lazy pages) at `path` with the given session. */
export function renderApp(
  path: string,
  me: MeResponse | null,
): { router: ReturnType<typeof createMemoryRouter>; client: QueryClient } {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } });
  client.setQueryData(queryKeys.me, me);
  const router = createMemoryRouter([{ path: '*', Component: AppRoutes }], { initialEntries: [path] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, client };
}

export function currentUrl(router: ReturnType<typeof createMemoryRouter>): string {
  const { pathname, search } = router.state.location;
  return `${pathname}${search}`;
}
