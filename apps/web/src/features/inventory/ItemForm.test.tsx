import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryItemDto } from '@homi/shared';
import { ApiError } from '@/api/client';
import { ItemForm, type ItemFormProps } from './ItemForm';

const api = vi.hoisted(() => ({
  createItem: vi.fn(),
  updateItem: vi.fn(),
  fetchItem: vi.fn(),
  uploadItemImage: vi.fn(),
  deleteItemImage: vi.fn(),
}));

vi.mock('@/api/inventory', () => api);
vi.mock('@/hooks/useActiveHousehold', () => ({ useRequiredHouseholdId: () => 'h1' }));

const oil: InventoryItemDto = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
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
  version: 3,
};

function renderForm(props: Partial<ItemFormProps> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const handlers = { onCreated: vi.fn(), onSaved: vi.fn(), onMissing: vi.fn() };
  render(
    <QueryClientProvider client={client}>
      <ItemForm mode="new" draftScope={`test:${Math.random()}`} {...handlers} {...props} />
    </QueryClientProvider>,
  );
  return handlers;
}

describe('ItemForm keyboard (review finding: "Weiter" saved a half-filled item)', () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    sessionStorage.clear();
  });

  it('moves from Artikelname to Kategorie on Enter instead of submitting', () => {
    renderForm();
    const name = screen.getByLabelText('Artikelname');
    expect(name).toHaveAttribute('enterkeyhint', 'next');
    fireEvent.change(name, { target: { value: 'Olivenöl' } });
    expect(screen.getByRole('button', { name: 'Artikel hinzufügen' })).toBeEnabled();

    name.focus();
    // `false` = the default action (the browser's implicit form submission) was cancelled
    expect(fireEvent.keyDown(name, { key: 'Enter' })).toBe(false);
    expect(screen.getByRole('combobox', { name: 'Kategorie' })).toHaveFocus();
    expect(api.createItem).not.toHaveBeenCalled();
  });

  it('closes the keyboard on Enter in the price field without saving', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Artikelname'), { target: { value: 'Olivenöl' } });
    const price = screen.getByLabelText('Preis pro Einheit');
    price.focus();
    expect(fireEvent.keyDown(price, { key: 'Enter' })).toBe(false);
    expect(price).not.toHaveFocus();
    expect(api.createItem).not.toHaveBeenCalled();
  });

  it('still saves with the primary button', async () => {
    api.createItem.mockResolvedValue({ ...oil, category: 'SONSTIGES', unit: 'STUECK', quantity: '1' });
    const { onCreated } = renderForm();
    fireEvent.change(screen.getByLabelText('Artikelname'), { target: { value: 'Olivenöl' } });
    fireEvent.click(screen.getByRole('button', { name: 'Artikel hinzufügen' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(api.createItem).toHaveBeenCalledWith('h1', expect.objectContaining({ name: 'Olivenöl' }));
  });
});

describe('ItemForm version conflict', () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    sessionStorage.clear();
  });

  it('explains a conflict neutrally (it may stem from the user’s own quantity taps)', async () => {
    api.updateItem.mockRejectedValue(
      new ApiError({ status: 409, code: 'VERSION_CONFLICT', message: 'Konflikt', details: { currentVersion: 4 } }),
    );
    renderForm({ mode: 'edit', item: oil });
    fireEvent.change(screen.getByLabelText('Artikelname'), { target: { value: 'Olivenöl extra' } });
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen sichern' }));

    const alert = await screen.findByText(/Der Artikel wurde inzwischen geändert/);
    expect(alert.textContent).not.toMatch(/jemand anderem/);
    expect(screen.getByRole('button', { name: 'Neu laden' })).toBeInTheDocument();
    expect(api.updateItem).toHaveBeenCalledWith('h1', oil.id, expect.objectContaining({ version: 3 }));
  });
});
