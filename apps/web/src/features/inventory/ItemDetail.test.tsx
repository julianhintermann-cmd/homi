import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryItemDto } from '@homi/shared';
import { networkError } from '@/api/client';
import { useToastStore } from '@/components';
import { ItemDetail } from './ItemDetail';

const changeItemQuantity = vi.hoisted(() => vi.fn());

vi.mock('@/api/inventory', () => ({ changeItemQuantity }));
vi.mock('@/hooks/useActiveHousehold', () => ({ useRequiredHouseholdId: () => 'h1' }));

const caps: InventoryItemDto = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  name: 'Nespresso Kapseln',
  category: 'KUECHE',
  quantity: '24',
  unit: 'STUECK',
  unitPrice: '0.54',
  totalValue: '12.96',
  image: null,
  createdBy: null,
  createdAt: '2026-10-12T08:00:00.000Z',
  updatedAt: '2026-10-12T08:00:00.000Z',
  version: 1,
};

function renderDetail(item: InventoryItemDto = caps) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ItemDetail item={item} onEdit={vi.fn()} onAddToShopping={vi.fn()} addingToShopping={false} />
    </QueryClientProvider>,
  );
  return client;
}

function value(): string {
  return screen.getByRole('spinbutton', { name: 'Menge' }).textContent ?? '';
}

describe('ItemDetail quantity stepper (design 05)', () => {
  beforeEach(() => {
    changeItemQuantity.mockReset();
    useToastStore.setState({ current: null });
  });

  it('updates optimistically and sends one atomic delta for a burst of taps', async () => {
    changeItemQuantity.mockImplementation(async (_hid: string, _id: string, delta: string) => ({
      ...caps,
      quantity: String(24 + Number(delta)),
      totalValue: null,
      version: 2,
    }));
    renderDetail();
    expect(screen.getByRole('heading', { name: 'Nespresso Kapseln' })).toBeInTheDocument();
    expect(screen.getByText('CHF 12.96')).toBeInTheDocument();

    const plus = screen.getByRole('button', { name: 'Menge erhöhen' });
    fireEvent.click(plus);
    fireEvent.click(plus);
    expect(value()).toBe('26');
    // the total follows the optimistic quantity (26 × 0.54)
    expect(screen.getByText('CHF 14.04')).toBeInTheDocument();

    await waitFor(() => expect(changeItemQuantity).toHaveBeenCalledTimes(1));
    expect(changeItemQuantity).toHaveBeenCalledWith('h1', caps.id, '2');
    await waitFor(() => expect(value()).toBe('26'));
  });

  it('rolls back and shows a toast when the server rejects the change', async () => {
    changeItemQuantity.mockRejectedValue(networkError());
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Menge verringern' }));
    expect(value()).toBe('23');
    await waitFor(() => expect(value()).toBe('24'));
    expect(useToastStore.getState().current).toMatchObject({
      tone: 'error',
      message: 'Keine Verbindung – die Menge wurde nicht gespeichert.',
    });
  });

  it('disables minus at zero and shows unknown prices without CHF 0.00', () => {
    renderDetail({ ...caps, quantity: '0', unitPrice: null, totalValue: null });
    expect(screen.getByRole('button', { name: 'Menge verringern' })).toBeDisabled();
    expect(screen.getByText('Preis unbekannt')).toBeInTheDocument();
    expect(screen.queryByText(/CHF 0\.00/)).not.toBeInTheDocument();
  });
});
