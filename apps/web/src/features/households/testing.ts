import { createElement, type ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import type { DashboardDto, HouseholdDetail, MeResponse } from '@homi/shared';
import { queryKeys } from '@/api/queryKeys';
import { ToastHost } from '@/components/Toast';
import { useToastStore } from '@/components/toastStore';
import { createQueryClient } from '@/lib/queryClient';

/*
 * Test helpers for the households + home features (vitest/jsdom only – not part of the app bundle).
 * Sample data mirrors the design (01 Home / 09 Haushalt: Julian, Lisa, Max in "Unser Zuhause").
 */

export const IDS = {
  julian: '8e0a1c0e-1d7b-4a43-8f5e-2f0c9b7d6a11',
  lisa: '2b1d6f3a-5c4e-4b7a-9d8c-1e2f3a4b5c6d',
  max: '7f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918',
  home: '5b0c2f5e-6c0b-4c55-9d43-0d3f3c2b1a10',
  holiday: 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f',
} as const;

export function makeMe(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    user: { id: IDS.julian, displayName: 'Julian', email: 'julian@example.ch', createdAt: '2026-10-01T08:00:00.000Z' },
    households: [
      { id: IDS.home, name: 'Unser Zuhause', role: 'OWNER', memberCount: 3 },
      { id: IDS.holiday, name: 'Ferienhaus', role: 'MEMBER', memberCount: 2 },
    ],
    activeHouseholdId: IDS.home,
    ...overrides,
  };
}

export function makeHousehold(overrides: Partial<HouseholdDetail> = {}): HouseholdDetail {
  return {
    id: IDS.home,
    name: 'Unser Zuhause',
    createdAt: '2026-10-01T08:00:00.000Z',
    myRole: 'OWNER',
    members: [
      { userId: IDS.lisa, displayName: 'Lisa', role: 'MEMBER', joinedAt: '2026-10-02T08:00:00.000Z' },
      { userId: IDS.julian, displayName: 'Julian', role: 'OWNER', joinedAt: '2026-10-01T08:00:00.000Z' },
      { userId: IDS.max, displayName: 'Max', role: 'MEMBER', joinedAt: '2026-10-03T08:00:00.000Z' },
    ],
    stats: { itemCount: 128 },
    ...overrides,
  };
}

const AT = '2026-10-12T07:30:00.000Z';
const JULIAN_REF = { id: IDS.julian, displayName: 'Julian' };

function item(id: string, name: string, quantity: string, unit: 'STUECK' | 'PACKUNG' | 'FLASCHE', image = true) {
  return {
    id,
    name,
    category: 'KUECHE' as const,
    quantity,
    unit,
    unitPrice: null,
    totalValue: null,
    image: image
      ? { id, thumbUrl: `/api/households/${IDS.home}/images/${id}?variant=thumb`, fullUrl: `/full/${id}` }
      : null,
    createdBy: JULIAN_REF,
    createdAt: AT,
    updatedAt: AT,
    version: 1,
  };
}

function shopping(id: string, name: string, quantity: string | null, unit: 'STUECK' | 'GRAMM' | 'FLASCHE' | null) {
  return {
    id,
    name,
    quantity,
    unit,
    unitPrice: null,
    completed: false,
    completedAt: null,
    completedBy: null,
    sourceItemId: null,
    createdBy: JULIAN_REF,
    createdAt: AT,
    updatedAt: AT,
  };
}

export function makeDashboard(overrides: Partial<DashboardDto> = {}): DashboardDto {
  return {
    itemCount: 128,
    inventoryValue: '2485.50',
    unpricedItemCount: 0,
    weeklyValueDelta: '42.80',
    openShoppingCount: 8,
    recentItems: [
      item('0a6d2c55-1f3e-4b8a-9c7d-111111111111', 'Milch', '3', 'STUECK'),
      item('0a6d2c55-1f3e-4b8a-9c7d-222222222222', 'Kaffee', '2', 'PACKUNG'),
      item('0a6d2c55-1f3e-4b8a-9c7d-333333333333', 'Olivenöl', '2', 'FLASCHE', false),
    ],
    openShoppingItems: [
      shopping('5e1f0a2b-3c4d-4e5f-8a9b-aaaaaaaaaaaa', 'Eier', '12', 'STUECK'),
      shopping('5e1f0a2b-3c4d-4e5f-8a9b-bbbbbbbbbbbb', 'Butter', '250', 'GRAMM'),
      shopping('5e1f0a2b-3c4d-4e5f-8a9b-cccccccccccc', 'Spülmittel', '1', 'FLASCHE'),
    ],
    members: [
      { userId: IDS.lisa, displayName: 'Lisa' },
      { userId: IDS.julian, displayName: 'Julian' },
      { userId: IDS.max, displayName: 'Max' },
    ],
    recentActivity: [],
    ...overrides,
  };
}

export function jsonResponse(status: number, body?: unknown): Response {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body ?? {}), { status, headers: { 'Content-Type': 'application/json' } });
}

export type FetchHandler = (url: string, init: RequestInit) => Response | Promise<Response>;

/** Stubs `fetch`; unexpected requests fail loudly. */
export function mockFetch(handler: FetchHandler) {
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => handler(String(input), init));
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function bodyOf(init: RequestInit | undefined): unknown {
  return typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
}

export interface RenderOptions {
  path?: string;
  route?: string;
  me?: MeResponse | null;
  /** Leave the session unknown (`/auth/me` is fetched through the mocked `fetch`). */
  sessionPending?: boolean;
  data?: ReadonlyArray<readonly [QueryKey, unknown]>;
}

/** Renders `ui` at `route` inside a memory router + fresh query client pre-filled with `data`. */
export function renderScreen(
  ui: ReactElement,
  { path = '/', route = path, me = makeMe(), sessionPending = false, data = [] }: RenderOptions = {},
) {
  useToastStore.setState({ current: null });
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } });
  if (!sessionPending) client.setQueryData(queryKeys.me, me);
  for (const [key, value] of data) client.setQueryData(key, value);
  const router = createMemoryRouter(
    [
      { path, element: ui },
      { path: '*', element: createElement('p', { 'data-testid': 'route' }, 'other') },
    ],
    { initialEntries: [route] },
  );
  const result = render(
    createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router }), createElement(ToastHost)),
  );
  return { ...result, client, router };
}
