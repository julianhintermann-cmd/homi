import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InvitationPreview } from '@homi/shared';
import { queryKeys } from '@/api/queryKeys';
import { useActiveHouseholdUiStore } from '@/hooks/useActiveHousehold';
import { InvitationScreen } from './InvitationScreen';
import { IDS, bodyOf, jsonResponse, makeMe, mockFetch, renderScreen } from './testing';

const TOKEN = 'Q2xhdWRlLXRlc3QtdG9rZW4tMDEyMzQ1Njc4OWFiY2Rl';
const PREVIEW: InvitationPreview = {
  householdName: 'WG Basel',
  inviterName: 'Lisa',
  role: 'MEMBER',
  expiresAt: '2026-10-19T08:00:00.000Z',
  status: 'valid',
};

function renderInvitation(
  me = makeMe({ households: [], activeHouseholdId: null }) as ReturnType<typeof makeMe> | null,
) {
  return renderScreen(<InvitationScreen token={TOKEN} />, {
    path: '/einladung/:token',
    route: `/einladung/${TOKEN}`,
    me,
  });
}

beforeEach(() => {
  useActiveHouseholdUiStore.setState({ pendingHouseholdId: null });
});
afterEach(() => vi.unstubAllGlobals());

describe('InvitationScreen', () => {
  it('shows the preview and sends anonymous users to login/registration with a redirect back', async () => {
    mockFetch((url) => (url === `/api/invitations/${TOKEN}` ? jsonResponse(200, PREVIEW) : jsonResponse(404)));
    renderInvitation(null);
    expect(await screen.findByRole('heading', { name: 'WG Basel' })).toBeInTheDocument();
    expect(screen.getByText('Lisa lädt dich in diesen Haushalt ein.')).toBeInTheDocument();
    expect(screen.getByText('Deine Rolle: Mitglied · gültig bis 19.10.2026')).toBeInTheDocument();
    // Regression (review): the redirect path is not percent-encoded, so the server's request logger
    // redacts the token on a full page load of the sign-in URL (it matches "/einladung/<token>").
    const redirect = `/einladung/${TOKEN}`;
    expect(screen.getByRole('link', { name: 'Anmelden' })).toHaveAttribute('href', `/login?redirect=${redirect}`);
    expect(screen.getByRole('link', { name: 'Konto erstellen' })).toHaveAttribute(
      'href',
      `/registrieren?redirect=${redirect}`,
    );
    expect(screen.queryByRole('button', { name: 'Einladung annehmen' })).not.toBeInTheDocument();
  });

  it('accepts for signed-in users, activates the household and goes Home', async () => {
    const user = userEvent.setup();
    const joined = makeMe({
      households: [{ id: IDS.home, name: 'WG Basel', role: 'MEMBER', memberCount: 2 }],
      activeHouseholdId: IDS.home,
    });
    const fetchMock = mockFetch((url, init) => {
      if (url === `/api/invitations/${TOKEN}/accept` && init.method === 'POST') {
        return jsonResponse(200, { householdId: IDS.home });
      }
      if (url === `/api/invitations/${TOKEN}`) return jsonResponse(200, PREVIEW);
      if (url === '/api/auth/me') return jsonResponse(200, joined);
      return jsonResponse(404);
    });
    const { router, client } = renderInvitation();
    await user.click(await screen.findByRole('button', { name: 'Einladung annehmen' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/invitations/${TOKEN}/accept`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(client.getQueryData(queryKeys.me)).toMatchObject({ activeHouseholdId: IDS.home });
    expect(await screen.findByText('Willkommen in «WG Basel»')).toBeInTheDocument();
  });

  it('names the role outside the sentence ("Verwaltung" does not fit "lädt dich als … ein")', async () => {
    mockFetch(() => jsonResponse(200, { ...PREVIEW, role: 'ADMIN' }));
    renderInvitation();
    expect(await screen.findByText('Deine Rolle: Verwaltung · gültig bis 19.10.2026')).toBeInTheDocument();
    expect(screen.queryByText(/als Verwaltung/)).not.toBeInTheDocument();
  });

  // Regression (review): while /auth/me was still loading, a signed-in user was offered "Anmelden".
  it('waits for the session before choosing between accepting and signing in', async () => {
    let resolveMe: (response: Response) => void = () => undefined;
    let previewServed = false;
    mockFetch((url) => {
      if (url === `/api/invitations/${TOKEN}`) {
        previewServed = true;
        return jsonResponse(200, PREVIEW);
      }
      if (url === '/api/auth/me') return new Promise<Response>((resolve) => (resolveMe = resolve));
      return jsonResponse(404);
    });
    renderScreen(<InvitationScreen token={TOKEN} />, {
      path: '/einladung/:token',
      route: `/einladung/${TOKEN}`,
      sessionPending: true,
    });
    expect(await screen.findByRole('status', { name: 'Einladung wird geladen …' })).toBeInTheDocument();
    await waitFor(() => expect(previewServed).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByRole('status', { name: 'Einladung wird geladen …' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Anmelden' })).not.toBeInTheDocument();
    resolveMe(jsonResponse(200, makeMe()));
    expect(await screen.findByRole('button', { name: 'Einladung annehmen' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Anmelden' })).not.toBeInTheDocument();
  });

  // Regression (review): accepting a link of a household you already belong to must persist the switch.
  it('persists the switch when the session still names another household after accepting', async () => {
    const user = userEvent.setup();
    const stale = makeMe({ activeHouseholdId: IDS.holiday });
    const fetchMock = mockFetch((url, init) => {
      if (url === `/api/invitations/${TOKEN}/accept`) return jsonResponse(200, { householdId: IDS.home });
      if (url === `/api/invitations/${TOKEN}`) return jsonResponse(200, PREVIEW);
      if (url === '/api/auth/me') return jsonResponse(200, stale);
      if (url === '/api/account/active-household' && init.method === 'PUT') return jsonResponse(204);
      return jsonResponse(404);
    });
    const { client, router } = renderInvitation(stale);
    await user.click(await screen.findByRole('button', { name: 'Einladung annehmen' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    const put = fetchMock.mock.calls.find(([url]) => url === '/api/account/active-household');
    expect(put?.[1]).toMatchObject({ method: 'PUT' });
    expect(bodyOf(put?.[1])).toEqual({ householdId: IDS.home });
    expect(client.getQueryData(queryKeys.me)).toMatchObject({ activeHouseholdId: IDS.home });
  });

  it.each([
    ['expired', 'Einladung abgelaufen'],
    ['revoked', 'Einladung widerrufen'],
    ['used', 'Einladung bereits verwendet'],
  ] as const)('explains a %s invitation', async (status, title) => {
    // The server withholds the names of links that are no longer valid.
    mockFetch(() => jsonResponse(200, { ...PREVIEW, status, householdName: null, inviterName: null }));
    renderInvitation();
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Einladung annehmen' })).not.toBeInTheDocument();
  });

  it('treats unknown tokens (404) as invalid', async () => {
    mockFetch(() => jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Diese Einladung ist ungültig.' } }));
    renderInvitation(null);
    expect(await screen.findByRole('heading', { name: 'Einladung ungültig' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zur Anmeldung' })).toHaveAttribute('href', '/login');
  });

  it('switches to the reason when accepting fails with 410', async () => {
    const user = userEvent.setup();
    mockFetch((url, init) => {
      if (init.method === 'POST') {
        return jsonResponse(410, {
          error: { code: 'INVITATION_INVALID', message: 'Bereits verwendet.', details: { status: 'used' } },
        });
      }
      return url === `/api/invitations/${TOKEN}` ? jsonResponse(200, PREVIEW) : jsonResponse(404);
    });
    renderInvitation();
    await user.click(await screen.findByRole('button', { name: 'Einladung annehmen' }));
    expect(await screen.findByRole('heading', { name: 'Einladung bereits verwendet' })).toBeInTheDocument();
  });
});
