import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryItemDto } from '@homi/shared';
import { queryKeys } from '@/api/queryKeys';
import { paths } from '@/routes/paths';
import { ItemDetail } from './ItemDetail';
import { useItemActions } from './useItemActions';

const changeItemQuantity = vi.hoisted(() => vi.fn());
const openSheet = vi.hoisted(() => vi.fn());

vi.mock('@/api/inventory', () => ({ changeItemQuantity, deleteItem: vi.fn() }));
vi.mock('@/routes/navigation', () => ({ useOpenSheet: () => openSheet }));
vi.mock('@/hooks/useActiveHousehold', () => ({
  useRequiredHouseholdId: () => 'h1',
  useActiveHousehold: () => ({
    householdId: 'h1',
    household: { id: 'h1', name: 'Unser Zuhause', role: 'OWNER', memberCount: 3 },
    households: [],
  }),
}));

const caps: InventoryItemDto = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  name: 'Nespresso Kapseln',
  category: 'KUECHE',
  quantity: '1',
  unit: 'STUECK',
  unitPrice: '0.54',
  totalValue: '0.54',
  image: null,
  createdBy: null,
  createdAt: '2026-10-12T08:00:00.000Z',
  updatedAt: '2026-10-12T08:00:00.000Z',
  version: 1,
};

function Harness({ item }: { item: InventoryItemDto }) {
  const actions = useItemActions();
  return (
    <ItemDetail
      item={item}
      onEdit={() => actions.edit(item)}
      onAddToShopping={vi.fn()}
      addingToShopping={false}
      editPending={actions.openingEditFor === item.id}
    />
  );
}

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(queryKeys.item('h1', caps.id), caps);
  render(
    <QueryClientProvider client={client}>
      <Harness item={caps} />
    </QueryClientProvider>,
  );
  return client;
}

// Review finding: tapping + and then "Bearbeiten" on a slow network opened the form with the old
// version; saving it failed with a conflict blamed on "jemand anderem".
describe('Bearbeiten after quantity taps (design 05 → 07)', () => {
  beforeEach(() => {
    changeItemQuantity.mockReset();
    openSheet.mockReset();
  });

  it('opens the edit sheet only after the own taps were saved, from the confirmed version', async () => {
    let answer: (item: InventoryItemDto) => void = () => undefined;
    changeItemQuantity.mockImplementation(
      () =>
        new Promise<InventoryItemDto>((resolve) => {
          answer = resolve;
        }),
    );
    const client = renderDetail();
    const versionsSeenByForm: Array<number | undefined> = [];
    openSheet.mockImplementation(() => {
      versionsSeenByForm.push(client.getQueryData<InventoryItemDto>(queryKeys.item('h1', caps.id))?.version);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Menge erhöhen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Menge erhöhen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));

    // the taps are sent right away (no debounce) and the sheet waits for the answer
    expect(changeItemQuantity).toHaveBeenCalledWith('h1', caps.id, '2');
    expect(openSheet).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Bearbeiten/ })).toHaveAttribute('aria-busy', 'true');

    answer({ ...caps, quantity: '3', totalValue: '1.62', version: 2 });
    await waitFor(() => expect(openSheet).toHaveBeenCalledWith(paths.inventoryEdit(caps.id)));
    expect(openSheet).toHaveBeenCalledTimes(1);
    expect(versionsSeenByForm).toEqual([2]);
    expect(screen.getByRole('button', { name: 'Bearbeiten' })).not.toHaveAttribute('aria-busy');
  });

  it('opens the edit sheet at once when nothing is pending', () => {
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    expect(openSheet).toHaveBeenCalledWith(paths.inventoryEdit(caps.id));
    expect(changeItemQuantity).not.toHaveBeenCalled();
  });
});
