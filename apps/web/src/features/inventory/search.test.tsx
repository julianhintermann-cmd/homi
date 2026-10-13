import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryItemDto, ItemListResponse } from '@homi/shared';
import { useDebouncedValue } from './hooks';

const fetchItems = vi.hoisted(() => vi.fn());

vi.mock('@/api/inventory', () => ({
  fetchItems,
  fetchItem: vi.fn(),
  createItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  changeItemQuantity: vi.fn(),
  uploadItemImage: vi.fn(),
  deleteItemImage: vi.fn(),
}));

vi.mock('@/hooks/useActiveHousehold', () => ({
  useRequiredHouseholdId: () => 'h1',
  useActiveHousehold: () => ({
    householdId: 'h1',
    household: { id: 'h1', name: 'Unser Zuhause', role: 'OWNER', memberCount: 3 },
    households: [],
  }),
}));

function item(name: string, overrides: Partial<InventoryItemDto> = {}): InventoryItemDto {
  return {
    id: `id-${name}`,
    name,
    category: 'KUECHE',
    quantity: '2',
    unit: 'FLASCHE',
    unitPrice: '8.50',
    totalValue: '17.00',
    image: null,
    createdBy: null,
    createdAt: '2026-10-12T08:00:00.000Z',
    updatedAt: '2026-10-12T08:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

const ALL = [item('Nespresso Kapseln'), item('Olivenöl'), item('Milch')];

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('only publishes the value after it stopped changing for the delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 250), {
      initialProps: { value: '' },
    });
    for (const value of ['O', 'Ol', 'Oli', 'Oliv']) {
      rerender({ value });
      act(() => vi.advanceTimersByTime(100));
      expect(result.current).toBe('');
    }
    // 100 ms have passed since the last change
    act(() => vi.advanceTimersByTime(149));
    expect(result.current).toBe('');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('Oliv');
  });
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="url">{`${location.pathname}${location.search}`}</output>;
}

describe('InventoryPage search', () => {
  beforeEach(() => {
    // jsdom has no scrolling (ChipRow keeps the selected chip in view).
    if (typeof Element.prototype.scrollTo !== 'function') {
      Element.prototype.scrollTo = (() => undefined) as typeof Element.prototype.scrollTo;
    }
    fetchItems.mockReset();
    fetchItems.mockImplementation(
      async (_householdId: string, params: { search?: string | null }): Promise<ItemListResponse> => {
        const items = params.search
          ? ALL.filter((entry) => entry.name.toLowerCase().includes(String(params.search).toLowerCase()))
          : ALL;
        return { items, nextCursor: null, total: params.search ? items.length : 128 };
      },
    );
  });

  it('searches on the server 250 ms after the last keystroke and shows the hit count (design 17)', async () => {
    const { InventoryPage } = await import('@/pages/InventoryPage');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/inventar']}>
          <InventoryPage />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('128 Artikel in deinem Haushalt')).toBeInTheDocument();
    expect(fetchItems).toHaveBeenCalledTimes(1);
    expect(fetchItems.mock.calls[0]?.[1]).toMatchObject({ search: null, category: null, sort: 'recent' });

    const field = screen.getByRole('searchbox', { name: 'Artikel suchen' });
    for (const value of ['O', 'Ol', 'Oli', 'Oliv']) fireEvent.change(field, { target: { value } });

    expect(await screen.findByText('1 Treffer für «Oliv»')).toBeInTheDocument();
    const searches = fetchItems.mock.calls.map((call) => (call[1] as { search: string | null }).search);
    expect(searches).toEqual([null, 'Oliv']);
    expect(screen.getByTestId('url')).toHaveTextContent('/inventar?search=Oliv');
    expect(screen.getByRole('link', { name: /Olivenöl/ })).toHaveAttribute('href', '/inventar/id-Oliven%C3%B6l');
    expect(screen.queryByRole('link', { name: /Milch/ })).not.toBeInTheDocument();

    // clearing the search restores the full list
    fireEvent.click(screen.getByRole('button', { name: 'Suchbegriff löschen' }));
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent(/^\/inventar$/));
    expect(await screen.findByText('128 Artikel in deinem Haushalt')).toBeInTheDocument();
  });

  // Review finding: while the search request was in flight the header read "128 Treffer für
  // «Oliv»" over the unfiltered list.
  it('keeps describing the visible result while a search loads and dims it', async () => {
    let answer: (response: ItemListResponse) => void = () => undefined;
    fetchItems.mockImplementation(async (_householdId: string, params: { search?: string | null }) =>
      params.search
        ? new Promise<ItemListResponse>((resolve) => {
            answer = resolve;
          })
        : { items: ALL, nextCursor: null, total: 128 },
    );
    const { InventoryPage } = await import('@/pages/InventoryPage');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/inventar']}>
          <InventoryPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('128 Artikel in deinem Haushalt')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Artikel suchen' }), { target: { value: 'Oliv' } });
    await waitFor(() => expect(fetchItems).toHaveBeenCalledTimes(2));
    const results = container.querySelector('.inventory-results');
    await waitFor(() => expect(results).toHaveAttribute('aria-busy', 'true'));
    expect(screen.getByText('128 Artikel in deinem Haushalt')).toBeInTheDocument();
    expect(screen.queryByText(/Treffer/)).not.toBeInTheDocument();

    act(() => answer({ items: [ALL[1]!], nextCursor: null, total: 1 }));
    expect(await screen.findByText('1 Treffer für «Oliv»')).toBeInTheDocument();
    expect(results).not.toHaveAttribute('aria-busy');
    expect(results).not.toHaveAttribute('data-stale');
  });

  it('shows the empty state of design 10 for a household without items', async () => {
    fetchItems.mockResolvedValue({ items: [], nextCursor: null, total: 0 });
    const { InventoryPage } = await import('@/pages/InventoryPage');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/inventar']}>
          <InventoryPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Noch keine Artikel' })).toBeInTheDocument();
    expect(screen.getByText('0 Artikel in deinem Haushalt')).toBeInTheDocument();
    expect(screen.getByText('Füge deinen ersten Artikel hinzu.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Artikel hinzufügen' })).toHaveLength(2); // toolbar + empty state
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });
});
