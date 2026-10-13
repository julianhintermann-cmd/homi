import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShoppingItemDto, ShoppingListResponse } from '@homi/shared';
import { queryKeys } from '@/api/queryKeys';
import { IDS, bodyOf, jsonResponse, makeHousehold, mockFetch, renderScreen } from '@/features/households/testing';
import { ShoppingPage } from '@/pages/ShoppingPage';
import { COMPLETED_EXPANDED_STORAGE_KEY } from './completedDisclosure';
import { usePendingShoppingOps } from './pendingOps';

/*
 * Regression (review): ticking off or restoring an item with the keyboard unmounts the focused
 * checkbox (the row changes lists) – focus must land on a sensible control, not on <body>.
 */

const JULIAN = { id: IDS.julian, displayName: 'Julian' };
const EIER = 'e1e1e1e1-0000-4000-8000-000000000001';
const BUTTER = 'e1e1e1e1-0000-4000-8000-000000000002';
const KAFFEE = 'e1e1e1e1-0000-4000-8000-000000000003';
const BROT = 'e1e1e1e1-0000-4000-8000-000000000004';

function item(id: string, name: string, minute: number, overrides: Partial<ShoppingItemDto> = {}): ShoppingItemDto {
  const at = `2026-10-12T08:${String(minute).padStart(2, '0')}:00.000Z`;
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
    createdBy: JULIAN,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

let items: ShoppingItemDto[];

function snapshot(): ShoppingListResponse {
  const open = items.filter((entry) => !entry.completed);
  const completed = items.filter((entry) => entry.completed);
  return {
    list: { id: 'f0f0f0f0-0000-4000-8000-000000000000', name: 'Einkaufsliste' },
    open,
    completed,
    stats: { done: completed.length, total: items.length },
  };
}

function renderShopping() {
  return renderScreen(<ShoppingPage />, {
    data: [
      [queryKeys.shopping(IDS.home), snapshot()],
      [queryKeys.household(IDS.home), makeHousehold()],
    ],
  });
}

const checkbox = (name: string) => screen.getByRole('checkbox', { name });
const settle = () => new Promise((resolve) => setTimeout(resolve, 450));

beforeEach(() => {
  usePendingShoppingOps.getState().reset();
  items = [
    item(EIER, 'Eier', 1, { quantity: '12', unit: 'STUECK' }),
    item(BUTTER, 'Butter', 2, { quantity: '250', unit: 'GRAMM' }),
    item(KAFFEE, 'Kaffee', 3),
    item(BROT, 'Brot', 4, { completed: true, completedAt: '2026-10-12T09:00:00.000Z', completedBy: JULIAN }),
  ];
  // A tiny server: PATCH flips `completed`, GET returns the current state.
  mockFetch((url, init) => {
    const method = init.method ?? 'GET';
    if (method === 'GET' && url.endsWith('/shopping')) return jsonResponse(200, snapshot());
    const match = /\/shopping\/items\/([0-9a-f-]+)$/.exec(url);
    if (method === 'PATCH' && match) {
      const body = bodyOf(init) as { completed?: boolean };
      items = items.map((entry) =>
        entry.id === match[1]
          ? {
              ...entry,
              completed: body.completed ?? entry.completed,
              completedAt: body.completed ? '2026-10-12T12:00:00.000Z' : null,
              completedBy: body.completed ? JULIAN : null,
            }
          : entry,
      );
      return jsonResponse(
        200,
        items.find((entry) => entry.id === match[1]),
      );
    }
    throw new Error(`unexpected ${method} ${url}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('focus when a row changes section', () => {
  it('moves to the next open row when the ticked row goes into the collapsed "Erledigt"', async () => {
    const user = userEvent.setup();
    renderShopping();
    checkbox('Eier, 12 Stück').focus();
    await user.keyboard(' ');

    // The tick plays in place first – focus stays on the checkbox.
    expect(checkbox('Eier, 12 Stück')).toBeChecked();
    expect(checkbox('Eier, 12 Stück')).toHaveFocus();

    await settle();
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Eier, 12 Stück' })).toBeNull());
    expect(checkbox('Butter, 250 g')).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('follows the item into the expanded "Erledigt" list', async () => {
    window.localStorage.setItem(COMPLETED_EXPANDED_STORAGE_KEY, '1');
    const user = userEvent.setup();
    renderShopping();
    checkbox('Butter, 250 g').focus();
    await user.keyboard(' ');
    await settle();

    const moved = checkbox('Butter, 250 g');
    expect(moved).toBeChecked();
    expect(moved.closest('.shopping-completed')).not.toBeNull();
    expect(moved).toHaveFocus();
  });

  it('follows a restored item back into the open list', async () => {
    window.localStorage.setItem(COMPLETED_EXPANDED_STORAGE_KEY, '1');
    const user = userEvent.setup();
    renderShopping();
    const brot = checkbox('Brot');
    expect(brot.closest('.shopping-completed')).not.toBeNull();
    brot.focus();
    await user.keyboard(' ');

    await waitFor(() => expect(checkbox('Brot').closest('.shopping-completed')).toBeNull());
    expect(checkbox('Brot')).not.toBeChecked();
    expect(checkbox('Brot')).toHaveFocus();
  });

  it('falls back to the previous row when the last open row was ticked', async () => {
    const user = userEvent.setup();
    renderShopping();
    checkbox('Kaffee').focus();
    await user.keyboard(' ');
    await settle();
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Kaffee' })).toBeNull());
    expect(checkbox('Butter, 250 g')).toHaveFocus();
  });

  it('falls back to the "Erledigt" toggle when no open row is left', async () => {
    items = items.filter((entry) => entry.id !== EIER && entry.id !== BUTTER);
    const user = userEvent.setup();
    renderShopping();
    checkbox('Kaffee').focus();
    await user.keyboard(' ');
    await settle();
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Kaffee' })).toBeNull());
    // No open row left, "Erledigt" collapsed: the disclosure toggle takes the focus.
    expect(screen.getByRole('button', { name: /Erledigt · 2/ })).toHaveFocus();
  });

  it('leaves the focus alone when the user has already moved on', async () => {
    const user = userEvent.setup();
    renderShopping();
    const add = screen.getByRole('textbox', { name: 'Artikel hinzufügen' });
    add.focus();
    // Tick with the pointer, then go on typing before the row moves.
    await user.pointer({ keys: '[MouseLeft]', target: checkbox('Eier, 12 Stück') });
    add.focus();
    await settle();
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Eier, 12 Stück' })).toBeNull());
    expect(add).toHaveFocus();
  });
});
