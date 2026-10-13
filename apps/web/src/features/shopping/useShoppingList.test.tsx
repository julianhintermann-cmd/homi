import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shoppingItemIdFor, type ShoppingItemDto, type ShoppingListResponse } from '@homi/shared';
import { queryKeys } from '@/api/queryKeys';
import { useToastStore } from '@/components';
import { createQueryClient } from '@/lib/queryClient';
import { usePendingShoppingOps } from './pendingOps';
import { newShoppingItem, useShoppingActions, useShoppingList } from './useShoppingList';

const HID = '11111111-1111-4111-8111-111111111111';
const ME = { id: '33333333-3333-4333-8333-333333333333', displayName: 'Julian' };
const MILCH_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function dto(id: string, name: string, overrides: Partial<ShoppingItemDto> = {}): ShoppingItemDto {
  return {
    id,
    name,
    quantity: null,
    unit: null,
    unitPrice: null,
    completed: false,
    completedAt: null,
    completedBy: null,
    sourceItemId: null,
    createdBy: ME,
    createdAt: '2026-10-12T08:00:00.000Z',
    updatedAt: '2026-10-12T08:00:00.000Z',
    ...overrides,
  };
}

function listOf(open: ShoppingItemDto[], completed: ShoppingItemDto[] = []): ShoppingListResponse {
  return {
    list: { id: '44444444-4444-4444-8444-444444444444', name: 'Einkaufsliste' },
    open,
    completed,
    stats: { done: completed.length, total: open.length + completed.length },
  };
}

interface RecordedRequest {
  method: string;
  url: string;
  body: unknown;
  headers: Headers;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function apiError(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

/** Minimal fake of the shopping API on top of `fetch`; mutations are answered by the test. */
class FakeServer {
  list: ShoppingListResponse = listOf([dto(MILCH_ID, 'Milch', { quantity: '2', unit: 'LITER' })]);
  readonly requests: RecordedRequest[] = [];
  private readonly pending: Array<{ request: RecordedRequest; reply: Deferred<Response> }> = [];
  /** Answer GETs with this snapshot instead of `list` (simulates a stale refetch). */
  staleList: ShoppingListResponse | null = null;

  readonly fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request: RecordedRequest = {
      method: init?.method ?? 'GET',
      url: String(input),
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      headers: new Headers(init?.headers),
    };
    this.requests.push(request);
    if (request.method === 'GET') return json(this.staleList ?? this.list);
    const reply = deferred<Response>();
    this.pending.push({ request, reply });
    return reply.promise;
  });

  mutations(): RecordedRequest[] {
    return this.requests.filter((request) => request.method !== 'GET');
  }

  /** Answers the oldest unanswered mutation. */
  async respond(response: Response | ((request: RecordedRequest) => Response)): Promise<RecordedRequest> {
    await waitFor(() => expect(this.pending.length).toBeGreaterThan(0));
    const next = this.pending.shift();
    if (!next) throw new Error('no pending request');
    await act(async () => {
      next.reply.resolve(typeof response === 'function' ? response(next.request) : response);
      await Promise.resolve();
    });
    return next.request;
  }

  get unanswered(): number {
    return this.pending.length;
  }
}

let server: FakeServer;
let client: QueryClient;

function renderShopping() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => ({ list: useShoppingList(HID), actions: useShoppingActions(HID, ME) }), { wrapper });
}

const openNames = (view: { open: ShoppingItemDto[] }) => view.open.map((item) => item.name);

beforeEach(() => {
  server = new FakeServer();
  client = createQueryClient();
  vi.stubGlobal('fetch', server.fetch);
  usePendingShoppingOps.getState().reset();
  useToastStore.setState({ current: null });
});

afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
});

describe('optimistic shopping mutations', () => {
  it('adds a row instantly under its final id and keeps exactly one copy after the server answered', async () => {
    const { result } = renderShopping();
    await waitFor(() => expect(result.current.list.data).toBeDefined());

    const added = newShoppingItem(
      HID,
      { name: 'Zwiebeln', quantity: '1', unit: 'KILOGRAMM', unitPrice: '2.40' },
      ME,
      result.current.list.view.open,
    );
    const { clientId } = added;
    const id = added.item.id;
    expect(clientId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // The final id is derived from household + client id (UUIDv5), exactly as the server does.
    expect(id).toBe(shoppingItemIdFor(HID, clientId));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    act(() => result.current.actions.addItem(added));

    // Visible before the server answered.
    expect(openNames(result.current.list.view)).toEqual(['Milch', 'Zwiebeln']);
    expect(result.current.list.view.stats).toEqual({ done: 0, total: 2 });

    const created = dto(id, 'Zwiebeln', {
      quantity: '1',
      unit: 'KILOGRAMM',
      unitPrice: '2.40',
      createdAt: '2026-10-12T09:00:00.000Z',
    });
    server.list = listOf([...server.list.open, created]);
    const request = await server.respond(json(created, 201));
    expect(request).toMatchObject({
      method: 'POST',
      url: `/api/households/${HID}/shopping/items`,
      body: { clientId, name: 'Zwiebeln', quantity: '1', unit: 'KILOGRAMM', unitPrice: '2.40' },
    });
    expect(request.headers.get('X-Homi-Request')).toBe('1');

    await waitFor(() => expect(usePendingShoppingOps.getState().ops[HID]).toEqual([]));
    expect(openNames(result.current.list.view)).toEqual(['Milch', 'Zwiebeln']);
    expect(result.current.list.view.open[1]?.id).toBe(id);
  });

  it('rolls an add back when the server rejects it', async () => {
    const { result } = renderShopping();
    await waitFor(() => expect(result.current.list.data).toBeDefined());
    const onRollback = vi.fn();
    const added = newShoppingItem(HID, { name: 'Brot', quantity: null, unit: null, unitPrice: null }, ME);
    act(() => result.current.actions.addItem({ ...added, onRollback }));
    expect(openNames(result.current.list.view)).toEqual(['Milch', 'Brot']);

    await server.respond(apiError(409, 'CONFLICT', 'Die Einkaufsliste ist voll. Lösche zuerst erledigte Artikel.'));
    await waitFor(() => expect(openNames(result.current.list.view)).toEqual(['Milch']));
    expect(onRollback).toHaveBeenCalledTimes(1);
    expect(useToastStore.getState().current).toMatchObject({
      tone: 'error',
      message: 'Die Einkaufsliste ist voll. Lösche zuerst erledigte Artikel.',
    });
  });

  it('ticks off instantly, survives a stale realtime refetch and rolls back on error', async () => {
    const { result } = renderShopping();
    await waitFor(() => expect(result.current.list.data).toBeDefined());

    act(() => result.current.actions.setCompleted(MILCH_ID, true));
    expect(result.current.list.view.open).toEqual([]);
    expect(result.current.list.view.completed[0]).toMatchObject({ id: MILCH_ID, completed: true, completedBy: ME });
    expect(result.current.list.view.stats).toEqual({ done: 1, total: 1 });

    // Another member's change triggers a refetch that still has the item open: no flicker.
    server.staleList = server.list;
    await act(async () => {
      await client.invalidateQueries({ queryKey: queryKeys.shopping(HID) });
    });
    expect(result.current.list.view.completed.map((item) => item.id)).toEqual([MILCH_ID]);

    const request = await server.respond(apiError(500, 'INTERNAL', 'Ein unerwarteter Fehler ist aufgetreten.'));
    expect(request).toMatchObject({ method: 'PATCH', body: { completed: true } });
    await waitFor(() => expect(openNames(result.current.list.view)).toEqual(['Milch']));
    expect(result.current.list.view.open[0]?.completed).toBe(false);
    expect(useToastStore.getState().current).toMatchObject({ tone: 'error' });
  });

  it('confirms a completion with the server copy', async () => {
    const { result } = renderShopping();
    await waitFor(() => expect(result.current.list.data).toBeDefined());
    act(() => result.current.actions.setCompleted(MILCH_ID, true));

    const completed = dto(MILCH_ID, 'Milch', {
      quantity: '2',
      unit: 'LITER',
      completed: true,
      completedAt: '2026-10-12T12:00:00.000Z',
      completedBy: { id: '55555555-5555-4555-8555-555555555555', displayName: 'Lisa' },
    });
    server.list = listOf([], [completed]);
    await server.respond(json(completed));
    await waitFor(() => expect(usePendingShoppingOps.getState().ops[HID]).toEqual([]));
    // The server's answer wins (Lisa ticked it off first).
    expect(result.current.list.view.completed).toEqual([completed]);
    expect(useToastStore.getState().current).toBeNull();
  });

  it('sends the requests of one item in order (create → complete → restore)', async () => {
    const { result } = renderShopping();
    await waitFor(() => expect(result.current.list.data).toBeDefined());
    const added = newShoppingItem(HID, { name: 'Reis', quantity: null, unit: null, unitPrice: null }, ME);
    const id = added.item.id;

    act(() => {
      result.current.actions.addItem(added);
      result.current.actions.setCompleted(id, true);
      result.current.actions.setCompleted(id, false);
    });
    expect(openNames(result.current.list.view)).toEqual(['Milch', 'Reis']);
    await waitFor(() => expect(server.mutations()).toHaveLength(1));
    expect(server.unanswered).toBe(1);

    await server.respond(json(dto(id, 'Reis'), 201));
    await waitFor(() => expect(server.mutations()).toHaveLength(2));
    await server.respond(json(dto(id, 'Reis', { completed: true, completedAt: 'x', completedBy: ME })));
    await waitFor(() => expect(server.mutations()).toHaveLength(3));
    await server.respond(json(dto(id, 'Reis')));

    expect(server.mutations().map((request) => [request.method, request.body])).toEqual([
      ['POST', { clientId: added.clientId, name: 'Reis', quantity: null, unit: null, unitPrice: null }],
      ['PATCH', { completed: true }],
      ['PATCH', { completed: false }],
    ]);
  });

  it('removes deleted rows at once and treats "already gone" as success', async () => {
    const { result } = renderShopping();
    await waitFor(() => expect(result.current.list.data).toBeDefined());
    act(() => result.current.actions.deleteItem(MILCH_ID));
    expect(result.current.list.view.open).toEqual([]);
    server.list = listOf([]);
    await server.respond(apiError(404, 'NOT_FOUND', 'Nicht gefunden.'));
    await waitFor(() => expect(usePendingShoppingOps.getState().ops[HID]).toEqual([]));
    expect(result.current.list.view.open).toEqual([]);
    expect(useToastStore.getState().current).toBeNull();
  });

  it('clears exactly the confirmed completed rows, not one ticked off by someone else meanwhile', async () => {
    const BROT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const KAFFEE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const done = (id: string, name: string, at: string) =>
      dto(id, name, { completed: true, completedAt: at, completedBy: ME });
    server.list = listOf([], [done(BROT_ID, 'Brot', '2026-10-12T10:00:00.000Z')]);
    const { result } = renderShopping();
    await waitFor(() => expect(result.current.list.view.completed).toHaveLength(1));

    act(() => result.current.actions.clearCompleted([BROT_ID]));
    expect(result.current.list.view.completed).toEqual([]);

    // Lisa ticks off Kaffee while the request is in flight: her row shows up, Brot stays hidden.
    const kaffee = done(KAFFEE_ID, 'Kaffee', '2026-10-12T10:05:00.000Z');
    server.list = listOf([], [kaffee, done(BROT_ID, 'Brot', '2026-10-12T10:00:00.000Z')]);
    await act(async () => {
      await client.invalidateQueries({ queryKey: queryKeys.shopping(HID) });
    });
    await waitFor(() => expect(result.current.list.view.completed).toEqual([kaffee]));

    server.list = listOf([], [kaffee]);
    const request = await server.respond(json({ deleted: 1 }));
    expect(request).toMatchObject({
      method: 'POST',
      url: `/api/households/${HID}/shopping/clear-completed`,
      body: { itemIds: [BROT_ID] },
    });
    await waitFor(() => expect(usePendingShoppingOps.getState().ops[HID]).toEqual([]));
    expect(result.current.list.view.completed).toEqual([kaffee]);
  });

  it('sends "Erledigte löschen" only after the completion of the same row was answered', async () => {
    const { result } = renderShopping();
    await waitFor(() => expect(result.current.list.data).toBeDefined());

    // Slow network: the completion is still in flight when the user confirms the clear.
    act(() => result.current.actions.setCompleted(MILCH_ID, true));
    await waitFor(() => expect(server.mutations()).toHaveLength(1));
    act(() => result.current.actions.clearCompleted([MILCH_ID]));
    expect(result.current.list.view.open).toEqual([]);
    expect(result.current.list.view.completed).toEqual([]);
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(server.mutations().map((request) => request.method)).toEqual(['PATCH']);

    const completed = dto(MILCH_ID, 'Milch', {
      quantity: '2',
      unit: 'LITER',
      completed: true,
      completedAt: '2026-10-12T12:00:00.000Z',
      completedBy: ME,
    });
    server.list = listOf([], [completed]);
    await server.respond(json(completed));
    await waitFor(() => expect(server.mutations()).toHaveLength(2));
    const clear = await server.respond(() => {
      server.list = listOf([]);
      return json({ deleted: 1 });
    });
    expect(clear).toMatchObject({
      method: 'POST',
      url: `/api/households/${HID}/shopping/clear-completed`,
      body: { itemIds: [MILCH_ID] },
    });

    await waitFor(() => expect(usePendingShoppingOps.getState().ops[HID]).toEqual([]));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(result.current.list.view.open).toEqual([]);
    expect(result.current.list.view.completed).toEqual([]);
  });

  it('shows a row again whose completion failed while "Erledigte löschen" waited for it', async () => {
    const { result } = renderShopping();
    await waitFor(() => expect(result.current.list.data).toBeDefined());
    act(() => result.current.actions.setCompleted(MILCH_ID, true));
    act(() => result.current.actions.clearCompleted([MILCH_ID]));
    await waitFor(() => expect(server.mutations()).toHaveLength(1));

    await server.respond(apiError(500, 'INTERNAL', 'Ein unerwarteter Fehler ist aufgetreten.'));
    await waitFor(() => expect(openNames(result.current.list.view)).toEqual(['Milch']));
    await waitFor(() => expect(server.mutations()).toHaveLength(2));
    // The server deletes only completed rows: Milch is open there, nothing is deleted.
    await server.respond(json({ deleted: 0 }));
    await waitFor(() => expect(usePendingShoppingOps.getState().ops[HID]).toEqual([]));
    expect(openNames(result.current.list.view)).toEqual(['Milch']);
    expect(server.mutations().map((request) => request.method)).toEqual(['PATCH', 'POST']);
  });

  it('sends quickly added items to the server in the order they were typed', async () => {
    const { result } = renderShopping();
    await waitFor(() => expect(result.current.list.data).toBeDefined());
    const values = { quantity: null, unit: null, unitPrice: null } as const;
    const first = newShoppingItem(HID, { ...values, name: 'Zwiebeln' }, ME, result.current.list.view.open);
    act(() => result.current.actions.addItem(first));
    const second = newShoppingItem(HID, { ...values, name: 'Knoblauch' }, ME, result.current.list.view.open);
    act(() => result.current.actions.addItem(second));
    expect(second.item.createdAt > first.item.createdAt).toBe(true);
    expect(openNames(result.current.list.view)).toEqual(['Milch', 'Zwiebeln', 'Knoblauch']);

    // The second POST waits until the first one was answered (slow first request).
    await waitFor(() => expect(server.mutations()).toHaveLength(1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(server.mutations()).toHaveLength(1);

    const zwiebeln = dto(first.item.id, 'Zwiebeln', { createdAt: '2026-10-12T09:00:00.000Z' });
    server.list = listOf([...server.list.open, zwiebeln]);
    await server.respond(json(zwiebeln, 201));
    await waitFor(() => expect(server.mutations()).toHaveLength(2));
    expect(openNames(result.current.list.view)).toEqual(['Milch', 'Zwiebeln', 'Knoblauch']);
    const knoblauch = dto(second.item.id, 'Knoblauch', { createdAt: '2026-10-12T09:00:00.040Z' });
    server.list = listOf([...server.list.open, knoblauch]);
    await server.respond(json(knoblauch, 201));

    expect(server.mutations().map((request) => (request.body as { name: string }).name)).toEqual([
      'Zwiebeln',
      'Knoblauch',
    ]);
    await waitFor(() => expect(usePendingShoppingOps.getState().ops[HID]).toEqual([]));
    expect(openNames(result.current.list.view)).toEqual(['Milch', 'Zwiebeln', 'Knoblauch']);
  });
});
