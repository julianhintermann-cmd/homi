import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { queryKeys } from '@/api/queryKeys';
import { useActiveHouseholdUiStore } from '@/hooks/useActiveHousehold';
import {
  IDS,
  bodyOf,
  jsonResponse,
  makeDashboard,
  makeHousehold,
  makeMe,
  mockFetch,
  renderScreen,
} from '@/features/households/testing';
import { HomeScreen } from './HomeScreen';
import { greetingFor } from './greeting';
import { shoppingQuantityLabel, trendLabel } from './labels';

function renderHome(dashboard = makeDashboard(), me = makeMe()) {
  return renderScreen(<HomeScreen />, { me, data: [[queryKeys.dashboard(IDS.home), dashboard]] });
}

beforeEach(() => {
  useActiveHouseholdUiStore.setState({ pendingHouseholdId: null });
  mockFetch((url) => {
    throw new Error(`unexpected fetch ${url}`);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('greeting & labels', () => {
  it('greets by local time', () => {
    expect(greetingFor(new Date(2026, 9, 12, 4, 59))).toBe('Guten Abend');
    expect(greetingFor(new Date(2026, 9, 12, 5, 0))).toBe('Guten Morgen');
    expect(greetingFor(new Date(2026, 9, 12, 10, 59))).toBe('Guten Morgen');
    expect(greetingFor(new Date(2026, 9, 12, 11, 0))).toBe('Guten Tag');
    expect(greetingFor(new Date(2026, 9, 12, 17, 59))).toBe('Guten Tag');
    expect(greetingFor(new Date(2026, 9, 12, 18, 0))).toBe('Guten Abend');
  });

  it('formats the weekly trend and shopping quantities', () => {
    expect(trendLabel('42.80')).toBe('+ CHF 42.80');
    expect(trendLabel('-5')).toBe('− CHF 5.00');
    expect(trendLabel('1250.5')).toBe('+ CHF 1’250.50');
    expect(trendLabel('0.00')).toBeNull();
    expect(shoppingQuantityLabel({ quantity: '250', unit: 'GRAMM' })).toBe('250 g');
    expect(shoppingQuantityLabel({ quantity: '1', unit: 'FLASCHE' })).toBe('1 Flasche');
    expect(shoppingQuantityLabel({ quantity: '2', unit: null })).toBe('2');
    expect(shoppingQuantityLabel({ quantity: null, unit: null })).toBeUndefined();
  });
});

describe('HomeScreen', () => {
  it('renders the design content from the dashboard', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 12, 8, 30));
    renderHome();

    expect(screen.getByText('Guten Morgen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Dein Zuhause.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Haushalt: Unser Zuhause. Haushalt wechseln' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Julian, Lisa, Max' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Haushalt & Profil' })).toHaveAttribute('href', '/haushalt');

    const summary = screen.getByRole('group', { name: 'Inventarwert' });
    expect(within(summary).getByText('CHF 2’485.50')).toBeInTheDocument();
    expect(within(summary).getByText('+ CHF 42.80')).toBeInTheDocument();
    expect(within(summary).getByText('128')).toBeInTheDocument();
    expect(within(summary).getByText('Artikel im Haushalt')).toBeInTheDocument();
    expect(within(summary).getByText('8 Artikel')).toBeInTheDocument();
    expect(within(summary).getByText('Auf der Einkaufsliste')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Alle ansehen' })).toHaveAttribute('href', '/inventar');
    const milk = screen.getByRole('link', { name: /Milch/ });
    expect(milk).toHaveAttribute('href', '/inventar/0a6d2c55-1f3e-4b8a-9c7d-111111111111');
    expect(within(milk).getByText('3 Stück')).toBeInTheDocument();
    expect(screen.getByText('2 Packungen')).toBeInTheDocument();
    expect(screen.getByText('2 Flaschen')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Alle 8 offenen Artikel ansehen' })).toHaveAttribute('href', '/einkauf');
    expect(screen.getByRole('checkbox', { name: 'Eier, 12 Stück' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Butter, 250 g' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Spülmittel, 1 Flasche' })).toBeInTheDocument();
    // No activity feed on Home (not part of the design).
    expect(screen.queryByText(/Aktivität/)).not.toBeInTheDocument();
  });

  it('hides the trend pill without change and shows decreases with a minus sign', () => {
    const { unmount } = renderHome(makeDashboard({ weeklyValueDelta: '0.00' }));
    expect(screen.queryByText(/\+ CHF/)).not.toBeInTheDocument();
    unmount();
    renderHome(makeDashboard({ weeklyValueDelta: '-5.00' }));
    expect(screen.getByText('− CHF 5.00')).toBeInTheDocument();
  });

  // Regression (review): unknown prices must never look like "CHF 0.00".
  it('says how many items have no price and never shows CHF 0.00 when none has one', () => {
    const { unmount } = renderHome(makeDashboard({ inventoryValue: '34.61', unpricedItemCount: 2, itemCount: 5 }));
    let summary = screen.getByRole('group', { name: 'Inventarwert' });
    expect(within(summary).getByText('CHF 34.61')).toBeInTheDocument();
    const note = summary.querySelector('.home-summary__note');
    expect(note).toBeVisible();
    expect(note?.textContent).toBe('· , 2 Artikel ohne Preis nicht eingerechnet');
    unmount();

    renderHome(makeDashboard({ inventoryValue: '0.00', unpricedItemCount: 2, itemCount: 2, weeklyValueDelta: '0.00' }));
    summary = screen.getByRole('group', { name: 'Inventarwert' });
    expect(within(summary).queryByText(/CHF 0.00/)).not.toBeInTheDocument();
    expect(within(summary).getByText('–')).toBeInTheDocument();
    expect(within(summary).getByText('Noch kein Preis erfasst')).toBeInTheDocument();
  });

  it('keeps CHF 0.00 for an empty household and shows no note when every item has a price', () => {
    renderHome(makeDashboard({ itemCount: 0, inventoryValue: '0.00', unpricedItemCount: 0, recentItems: [] }));
    const summary = screen.getByRole('group', { name: 'Inventarwert' });
    expect(within(summary).getByText('CHF 0.00')).toBeInTheDocument();
    expect(summary.querySelector('.home-summary__note')).toBeNull();
  });

  it('shows the empty states', async () => {
    const user = userEvent.setup();
    renderHome(
      makeDashboard({
        itemCount: 0,
        inventoryValue: '0.00',
        weeklyValueDelta: '0.00',
        openShoppingCount: 0,
        recentItems: [],
        openShoppingItems: [],
      }),
    );
    expect(screen.getByRole('heading', { name: 'Noch keine Artikel' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Alle ansehen' })).not.toBeInTheDocument();
    // Compact variant (review r2: the full-size empty state pushed the shopping card under the tab bar).
    expect(screen.getByRole('heading', { name: 'Noch keine Artikel' }).closest('.homi-empty')).toHaveClass(
      'home-empty',
    );
    expect(screen.getByText('Alles erledigt!')).toBeInTheDocument();
    // A status line, not an action (review r2: it was styled like the tappable invite row).
    const done = screen.getByText('Alles erledigt!').closest('.homi-list-row');
    expect(done).toHaveAttribute('data-variant', 'settings');
    expect(done?.tagName).toBe('DIV');
    expect(screen.getByRole('link', { name: 'Einkaufsliste öffnen' })).toHaveTextContent('Liste öffnen');
    await user.click(screen.getByRole('button', { name: 'Artikel hinzufügen' }));
    expect(await screen.findByTestId('route')).toBeInTheDocument(); // navigated to the /inventar/neu sheet route
  });

  it('shows skeletons while the dashboard loads', () => {
    mockFetch(() => new Promise<Response>(() => undefined));
    renderScreen(<HomeScreen />);
    expect(screen.getByRole('status', { name: 'Übersicht wird geladen …' })).toBeInTheDocument();
  });

  it('completes a shopping item optimistically and rolls back on error', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(() => jsonResponse(500, { error: { code: 'INTERNAL', message: 'Kaputt.' } }));
    renderHome();
    const summary = screen.getByRole('group', { name: 'Inventarwert' });

    await user.click(screen.getByRole('checkbox', { name: 'Eier, 12 Stück' }));
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(`/api/households/${IDS.home}/shopping/items/5e1f0a2b-3c4d-4e5f-8a9b-aaaaaaaaaaaa`);
    expect(init?.method).toBe('PATCH');
    expect(bodyOf(init)).toEqual({ completed: true });
    // Rolled back after the error.
    await waitFor(() => expect(within(summary).getByText('8 Artikel')).toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: 'Eier, 12 Stück' })).not.toBeChecked();
    expect(await screen.findByText('Kaputt.')).toBeInTheDocument();
  });

  // Regression (review r2): the whole row was the checkbox label – a tap on the name ticked the
  // item off. Only the checkbox completes; the rest of the row opens the shopping list.
  it('opens the shopping list from a row without completing the item', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(() => jsonResponse(404));
    const { router } = renderHome();
    await user.click(screen.getByRole('button', { name: 'Eier in der Einkaufsliste öffnen' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/einkauf'));
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toEqual([]);
  });

  // Regression (review r2): an accidental tick could only be undone on /einkauf.
  it('offers "Rückgängig" after ticking an item and reopens it', async () => {
    const user = userEvent.setup();
    const itemId = '5e1f0a2b-3c4d-4e5f-8a9b-aaaaaaaaaaaa';
    const fetchMock = mockFetch((url, init) => {
      if (init.method === 'PATCH') return jsonResponse(200, {});
      if (url.endsWith('/dashboard')) return jsonResponse(200, makeDashboard());
      return jsonResponse(404);
    });
    renderHome();
    await user.click(screen.getByRole('checkbox', { name: 'Eier, 12 Stück' }));
    expect(await screen.findByText('Eier erledigt')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rückgängig' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH').map(([, init]) => bodyOf(init)),
      ).toEqual([{ completed: true }, { completed: false }]),
    );
    const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH');
    expect(String(patches[1]?.[0])).toBe(`/api/households/${IDS.home}/shopping/items/${itemId}`);
    // The dashboard refetches and shows the item as open again.
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Eier, 12 Stück' })).not.toBeChecked());
  });

  // Regression (review r2): 108 pt tiles loaded only the 240 px thumb (upscaled on 3× iPhones).
  it('offers the full image variant to 3× screens for the tiles', () => {
    renderHome();
    const milk = screen.getByRole('link', { name: /Milch/ });
    const image = milk.querySelector('img');
    expect(image).toHaveAttribute(
      'src',
      `/api/households/${IDS.home}/images/0a6d2c55-1f3e-4b8a-9c7d-111111111111?variant=thumb`,
    );
    expect(image?.getAttribute('srcset')).toBe(
      `/api/households/${IDS.home}/images/0a6d2c55-1f3e-4b8a-9c7d-111111111111?variant=thumb 2x, /full/0a6d2c55-1f3e-4b8a-9c7d-111111111111 3x`,
    );
  });

  it('keeps the optimistic state on success and refetches the dashboard', async () => {
    const user = userEvent.setup();
    let resolvePatch: (response: Response) => void = () => undefined;
    const fetchMock = mockFetch((url, init) => {
      if (init.method === 'PATCH') return new Promise<Response>((resolve) => (resolvePatch = resolve));
      if (url.endsWith('/dashboard')) {
        return jsonResponse(200, makeDashboard({ openShoppingCount: 7, openShoppingItems: [] }));
      }
      return jsonResponse(404);
    });
    renderHome();
    const summary = screen.getByRole('group', { name: 'Inventarwert' });
    await user.click(screen.getByRole('checkbox', { name: 'Eier, 12 Stück' }));
    expect(within(summary).getByText('7 Artikel')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Eier, 12 Stück' })).toBeChecked();
    resolvePatch(jsonResponse(200, {}));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/dashboard'))).toBe(true));
    expect(await screen.findByText('Alles erledigt!')).toBeInTheDocument();
  });
});

describe('household switcher', () => {
  it('lists the memberships with a check on the active one and switches', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/account/active-household' && init.method === 'PUT') return jsonResponse(204);
      return new Promise<Response>(() => undefined); // dashboard of the new household stays loading
    });
    const { client } = renderHome();
    await user.click(screen.getByRole('button', { name: 'Haushalt: Unser Zuhause. Haushalt wechseln' }));

    const sheet = await screen.findByRole('dialog', { name: 'Haushalt wechseln' });
    const active = within(sheet).getByRole('radio', { name: /Unser Zuhause/ });
    expect(active).toHaveAttribute('aria-checked', 'true');
    expect(active).toHaveTextContent('Inhaber:in · 3 Mitglieder');
    const other = within(sheet).getByRole('radio', { name: /Ferienhaus/ });
    expect(other).toHaveAttribute('aria-checked', 'false');
    expect(within(sheet).getByRole('button', { name: 'Neuen Haushalt erstellen' })).toBeInTheDocument();
    // Regression (review): only the households are radios – the create action is outside the group.
    const group = within(sheet).getByRole('radiogroup', { name: 'Haushalte' });
    expect(within(group).getAllByRole('radio')).toHaveLength(2);
    expect(within(group).queryByRole('button', { name: 'Neuen Haushalt erstellen' })).not.toBeInTheDocument();

    await user.click(other);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/account/active-household',
        expect.objectContaining({ method: 'PUT' }),
      ),
    );
    const put = fetchMock.mock.calls.find(([url]) => url === '/api/account/active-household');
    expect(bodyOf(put?.[1])).toEqual({ householdId: IDS.holiday });
    await waitFor(() => expect(client.getQueryData(queryKeys.me)).toMatchObject({ activeHouseholdId: IDS.holiday }));
  });

  it('creates a new household from the switcher and makes it active', async () => {
    const user = userEvent.setup();
    const created = makeHousehold({
      id: 'f0e1d2c3-b4a5-4697-8899-aabbccddeeff',
      name: 'WG Basel',
      members: [{ userId: IDS.julian, displayName: 'Julian', role: 'OWNER', joinedAt: '2026-10-12T08:00:00.000Z' }],
      stats: { itemCount: 0 },
    });
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/households' && init.method === 'POST') return jsonResponse(201, created);
      if (url === '/api/auth/me') {
        return jsonResponse(
          200,
          makeMe({
            households: [...makeMe().households, { id: created.id, name: 'WG Basel', role: 'OWNER', memberCount: 1 }],
            activeHouseholdId: created.id,
          }),
        );
      }
      return new Promise<Response>(() => undefined);
    });
    const { client } = renderHome();
    await user.click(screen.getByRole('button', { name: 'Haushalt: Unser Zuhause. Haushalt wechseln' }));
    await user.click(await screen.findByRole('button', { name: 'Neuen Haushalt erstellen' }));

    const sheet = await screen.findByRole('dialog', { name: 'Neuer Haushalt' });
    // Regression (review): the name field gets the focus (the sheet used to keep it on its panel),
    // and the sheet has the design's cancel pill.
    await waitFor(() => expect(within(sheet).getByLabelText('Name des Haushalts')).toHaveFocus());
    expect(within(sheet).getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Haushalt erstellen' }));
    expect(within(sheet).getByText('Bitte gib einen Namen für den Haushalt ein.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/households', expect.anything());

    await user.type(within(sheet).getByLabelText('Name des Haushalts'), 'WG Basel');
    await user.click(within(sheet).getByRole('button', { name: 'Haushalt erstellen' }));
    await waitFor(() => expect(client.getQueryData(queryKeys.me)).toMatchObject({ activeHouseholdId: created.id }));
    const post = fetchMock.mock.calls.find(([url]) => url === '/api/households');
    expect(bodyOf(post?.[1])).toEqual({ name: 'WG Basel' });
    expect(await screen.findByText('«WG Basel» erstellt')).toBeInTheDocument();
  });
});
