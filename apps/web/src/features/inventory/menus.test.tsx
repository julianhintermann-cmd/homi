import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryItemDto, ItemListResponse } from '@homi/shared';
import { useRowMenu } from '@/components';

const fetchItems = vi.hoisted(() => vi.fn());

vi.mock('@/api/inventory', () => ({ fetchItems }));
vi.mock('@/hooks/useActiveHousehold', () => ({
  useRequiredHouseholdId: () => 'h1',
  useActiveHousehold: () => ({
    householdId: 'h1',
    household: { id: 'h1', name: 'Unser Zuhause', role: 'OWNER', memberCount: 3 },
    households: [],
  }),
}));

const oil: InventoryItemDto = {
  id: 'id-oil',
  name: 'Olivenöl',
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
};

// Review finding: the selected sort option was only marked by an aria-hidden check icon.
describe('Sort menu (design 02 toolbar)', () => {
  beforeEach(() => {
    localStorage.clear();
    if (typeof Element.prototype.scrollTo !== 'function') {
      Element.prototype.scrollTo = (() => undefined) as typeof Element.prototype.scrollTo;
    }
    fetchItems.mockReset();
    fetchItems.mockResolvedValue({ items: [oil], nextCursor: null, total: 1 } satisfies ItemListResponse);
  });

  it('announces the selected order as a checked radio item', async () => {
    const { InventoryPage } = await import('@/pages/InventoryPage');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/inventar']}>
          <InventoryPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText('1 Artikel in deinem Haushalt');

    fireEvent.click(screen.getByRole('button', { name: 'Sortieren' }));
    const menu = await screen.findByRole('menu', { name: 'Sortieren nach' });
    const options = screen.getAllByRole('menuitemradio');
    expect(options.map((option) => [option.textContent, option.getAttribute('aria-checked')])).toEqual([
      ['Name', 'false'],
      ['Zuletzt geändert', 'true'],
      ['Wert', 'false'],
    ]);
    expect(menu).toContainElement(options[0]!);

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Name' }));
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(fetchItems).toHaveBeenLastCalledWith('h1', expect.objectContaining({ sort: 'name' }), expect.anything()),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sortieren' }));
    expect(await screen.findByRole('menuitemradio', { name: 'Name' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'Zuletzt geändert' })).toHaveAttribute('aria-checked', 'false');
  });
});

function Row() {
  const menu = useRowMenu<HTMLAnchorElement>([
    { key: 'edit', label: 'Bearbeiten', icon: 'pencil', onSelect: vi.fn() },
    { key: 'delete', label: 'Löschen', icon: 'trash', destructive: true, onSelect: vi.fn() },
  ]);
  return (
    <>
      <a href="#oil" {...menu.handlers}>
        Olivenöl
      </a>
      {menu.menu}
      <output data-testid="menu-open">{String(menu.open)}</output>
    </>
  );
}

// Review finding: the click that follows lifting the finger after a long press landed on the
// freshly mounted dim and closed the menu again (design 16).
describe('Long-press context menu (design 16)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stays open after the finger is lifted and closes on a tap on the dim', () => {
    render(<Row />);
    const row = screen.getByRole('link', { name: 'Olivenöl' });
    fireEvent.pointerDown(row, { pointerType: 'touch', isPrimary: true, pointerId: 7, clientX: 50, clientY: 50 });
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // finger lifted: pointerup on the row (implicit touch capture), the click hits the dim
    fireEvent.pointerUp(row, { pointerType: 'touch', pointerId: 7 });
    const dim = document.querySelector('.homi-overlay-dim');
    expect(dim).not.toBeNull();
    fireEvent.click(dim!);
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByTestId('menu-open')).toHaveTextContent('true');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // a real tap on the dim dismisses it
    fireEvent.pointerDown(dim!, { pointerType: 'touch', pointerId: 8 });
    fireEvent.pointerUp(dim!, { pointerType: 'touch', pointerId: 8 });
    fireEvent.click(dim!);
    expect(screen.getByTestId('menu-open')).toHaveTextContent('false');
  });
});
