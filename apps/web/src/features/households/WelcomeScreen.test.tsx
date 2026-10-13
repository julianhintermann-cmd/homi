import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { queryKeys } from '@/api/queryKeys';
import { useActiveHouseholdUiStore } from '@/hooks/useActiveHousehold';
import { IDS, jsonResponse, makeHousehold, makeMe, mockFetch, renderScreen } from './testing';
import { WelcomeScreen } from './WelcomeScreen';

const TOKEN = 'Q2xhdWRlLXRlc3QtdG9rZW4tMDEyMzQ1Njc4OWFiY2Rl';

function renderWelcome(me = makeMe({ households: [], activeHouseholdId: null })) {
  return renderScreen(<WelcomeScreen />, { path: '/willkommen', me });
}

beforeEach(() => {
  useActiveHouseholdUiStore.setState({ pendingHouseholdId: null });
  mockFetch((url) => {
    throw new Error(`unexpected fetch ${url}`);
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('WelcomeScreen (/willkommen)', () => {
  it('shows the first-run screen to users without a household', () => {
    renderWelcome();
    expect(screen.getByRole('heading', { level: 1, name: 'Willkommen.' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name des Haushalts')).toHaveAttribute('placeholder', 'z. B. Unser Zuhause');
    expect(screen.getByRole('button', { name: 'Abmelden' })).toBeInTheDocument();
  });

  // Regression (review r2): Back after joining (or opening /willkommen directly) showed the
  // first-run screen to members of a household.
  it('sends users who already belong to a household Home', async () => {
    const { router } = renderWelcome(makeMe());
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(screen.queryByRole('heading', { name: 'Willkommen.' })).not.toBeInTheDocument();
  });

  it('creates a household and ends on Home with a toast (the redirect does not cut it short)', async () => {
    const user = userEvent.setup();
    const created = makeHousehold({
      id: IDS.home,
      name: 'Unser Zuhause',
      members: [{ userId: IDS.julian, displayName: 'Julian', role: 'OWNER', joinedAt: '2026-10-12T08:00:00.000Z' }],
      stats: { itemCount: 0 },
    });
    mockFetch((url, init) => {
      if (url === '/api/households' && init.method === 'POST') return jsonResponse(201, created);
      if (url === '/api/auth/me') return jsonResponse(200, makeMe({ households: [makeMe().households[0]!] }));
      return new Promise<Response>(() => undefined);
    });
    const { router, client } = renderWelcome();
    await user.type(screen.getByLabelText('Name des Haushalts'), 'Unser Zuhause');
    await user.click(screen.getByRole('button', { name: 'Haushalt erstellen' }));
    expect(await screen.findByText('«Unser Zuhause» erstellt')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(client.getQueryData(queryKeys.me)).toMatchObject({ activeHouseholdId: IDS.home });
  });

  it('opens a pasted invitation link in this app (token only)', async () => {
    const user = userEvent.setup();
    const { router } = renderWelcome();
    await user.type(screen.getByLabelText('Einladungslink'), `https://evil.example/einladung/${TOKEN}`);
    await user.click(screen.getByRole('button', { name: 'Einladung öffnen' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/einladung/${TOKEN}`));
  });
});
