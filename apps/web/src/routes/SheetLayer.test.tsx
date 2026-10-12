import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { SheetLayer } from './SheetLayer';

vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({
    data: {
      user: { id: 'u1', displayName: 'Lena', email: 'lena@example.ch', createdAt: '2026-01-01T00:00:00.000Z' },
      households: [{ id: 'h1', name: 'WG Bern', role: 'OWNER', memberCount: 1 }],
      activeHouseholdId: 'h1',
    },
  }),
}));

// Stand-in sheet page: becomes dirty as soon as something is typed.
vi.mock('./lazyPages', async () => {
  const { useState } = await import('react');
  const { useSheetDirty } = await import('./sheetDirty');
  function InventoryEditSheetPage() {
    const [name, setName] = useState('');
    useSheetDirty(name.length > 0);
    return <input aria-label="Artikelname" value={name} onChange={(event) => setName(event.target.value)} />;
  }
  return { InventoryEditSheetPage };
});

function CurrentPath() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

const sheetLocation = { pathname: '/inventar/neu', search: '', hash: '', state: null, key: 'sheet' };

function renderSheetRoute() {
  render(
    <MemoryRouter initialEntries={['/inventar/neu']}>
      <CurrentPath />
      {/* Rendered outside the main <Routes>, like in AppRoutes. */}
      <SheetLayer location={sheetLocation} />
    </MemoryRouter>,
  );
}

describe('SheetLayer', () => {
  it('closes immediately when the sheet page reports no unsaved input', async () => {
    renderSheetRoute();
    await screen.findByRole('textbox', { name: 'Artikelname' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByTestId('path')).toHaveTextContent('/inventar');
    expect(screen.getByTestId('path')).not.toHaveTextContent('/inventar/neu');
  });

  it('asks before discarding when the sheet page is dirty (useSheetDirty)', async () => {
    const user = userEvent.setup();
    renderSheetRoute();
    await user.type(await screen.findByRole('textbox', { name: 'Artikelname' }), 'Milch');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(await screen.findByRole('alertdialog', { name: 'Änderungen verwerfen?' })).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/inventar/neu');

    await user.click(screen.getByRole('button', { name: 'Verwerfen' }));
    expect(screen.getByTestId('path')).not.toHaveTextContent('/inventar/neu');
  });
});
