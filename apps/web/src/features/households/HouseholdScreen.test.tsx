import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HouseholdDetail } from '@homi/shared';
import { queryKeys } from '@/api/queryKeys';
import { useActiveHouseholdUiStore } from '@/hooks/useActiveHousehold';
import { HouseholdScreen } from './HouseholdScreen';
import { MemberScreen } from './MemberScreen';
import { IDS, bodyOf, jsonResponse, makeHousehold, mockFetch, renderScreen } from './testing';

function renderHousehold(detail: HouseholdDetail = makeHousehold()) {
  return renderScreen(<HouseholdScreen />, {
    path: '/haushalt',
    data: [[queryKeys.household(IDS.home), detail]],
  });
}

function withMyRole(role: 'OWNER' | 'ADMIN' | 'MEMBER', extra: Partial<HouseholdDetail> = {}): HouseholdDetail {
  const base = makeHousehold();
  return {
    ...base,
    myRole: role,
    members: base.members.map((m) =>
      m.userId === IDS.julian
        ? { ...m, role }
        : m.userId === IDS.lisa && role !== 'OWNER'
          ? { ...m, role: 'OWNER' }
          : m,
    ),
    ...extra,
  };
}

beforeEach(() => {
  useActiveHouseholdUiStore.setState({ pendingHouseholdId: null });
  mockFetch((url) => {
    throw new Error(`unexpected fetch ${url}`);
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('HouseholdScreen (design 09)', () => {
  it('shows the household, members ("Du" first) and the settings rows', () => {
    renderHousehold();
    expect(screen.getByRole('heading', { level: 1, name: 'Haushalt' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unser Zuhause' })).toBeInTheDocument();
    expect(screen.getByText('3 Mitglieder · 128 Artikel')).toBeInTheDocument();

    const members = screen.getByRole('region', { name: 'Mitglieder' });
    const rows = within(members).getAllByRole('link');
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'Du (Julian), Inhaber:in',
      'Lisa, Mitglied',
      'Max, Mitglied',
    ]);
    expect(rows[1]).toHaveAttribute('href', `/haushalt/mitglieder/${IDS.lisa}`);
    expect(within(members).getByRole('button', { name: 'Mitglied einladen' })).toBeInTheDocument();

    const settings = screen.getByRole('region', { name: 'Einstellungen' });
    expect(within(settings).getByRole('button', { name: 'Haushalt verwalten' })).toBeInTheDocument();
    expect(within(settings).getByRole('link', { name: 'Erscheinungsbild, Automatisch' })).toHaveAttribute(
      'href',
      '/einstellungen',
    );
    expect(within(settings).getByRole('link', { name: 'Profil' })).toHaveAttribute('href', '/profil');
    expect(within(settings).getByRole('link', { name: 'Einstellungen' })).toHaveAttribute('href', '/einstellungen');
  });

  it('hides the invite row for MEMBERs and shows it for ADMINs', () => {
    const { unmount } = renderHousehold(withMyRole('MEMBER'));
    expect(screen.queryByRole('button', { name: 'Mitglied einladen' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Du (Julian), Mitglied' })).toBeInTheDocument();
    unmount();
    renderHousehold(withMyRole('ADMIN'));
    expect(screen.getByRole('button', { name: 'Mitglied einladen' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Du (Julian), Verwaltung' })).toBeInTheDocument();
  });

  it('creates an invitation link and offers copy', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const url = `http://localhost:5173/einladung/${'T'.repeat(43)}`;
    const fetchMock = mockFetch((requestUrl, init) => {
      if (requestUrl.endsWith('/invitations') && init.method === 'POST') {
        return jsonResponse(201, {
          id: '0f0f0f0f-0000-4000-8000-000000000001',
          url,
          expiresAt: '2026-11-11T08:00:00.000Z',
          role: 'ADMIN',
        });
      }
      if (requestUrl.endsWith('/invitations')) return jsonResponse(200, []);
      return jsonResponse(404);
    });
    renderHousehold();
    await user.click(screen.getByRole('button', { name: 'Mitglied einladen' }));
    const sheet = await screen.findByRole('dialog', { name: 'Mitglied einladen' });
    await user.click(within(sheet).getByRole('radio', { name: 'Verwaltung' }));
    await user.click(within(sheet).getByRole('radio', { name: '30 Tage' }));
    await user.click(within(sheet).getByRole('button', { name: 'Link erstellen' }));

    expect(await within(sheet).findByDisplayValue(url)).toHaveAttribute('readonly');
    expect(within(sheet).getByText('Verwaltung · gültig bis 11.11.2026 · nur einmal verwendbar')).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(bodyOf(post?.[1])).toEqual({ role: 'ADMIN', expiresInDays: 30 });

    await user.click(within(sheet).getByRole('button', { name: 'Kopieren' }));
    expect(writeText).toHaveBeenCalledWith(url);
  });

  it('lists active invitations and revokes after confirmation', async () => {
    const user = userEvent.setup();
    const invitationId = '0f0f0f0f-0000-4000-8000-000000000002';
    const fetchMock = mockFetch((requestUrl, init) => {
      if (init.method === 'DELETE') return jsonResponse(204);
      if (requestUrl.endsWith('/invitations')) {
        return jsonResponse(200, [
          {
            id: invitationId,
            role: 'MEMBER',
            createdAt: '2026-10-12T08:00:00.000Z',
            expiresAt: '2026-10-19T08:00:00.000Z',
            createdBy: { id: IDS.julian, displayName: 'Julian' },
          },
        ]);
      }
      return jsonResponse(404);
    });
    renderHousehold();
    await user.click(screen.getByRole('button', { name: 'Mitglied einladen' }));
    const sheet = await screen.findByRole('dialog', { name: 'Mitglied einladen' });
    expect(await within(sheet).findByText('Mitglied · bis 19.10.2026')).toBeInTheDocument();
    expect(within(sheet).getByText(/^Erstellt von Julian · .*\d\d:\d\d$/)).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Widerrufen' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Einladung widerrufen?' });
    await user.click(within(dialog).getByRole('button', { name: 'Widerrufen' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/households/${IDS.home}/invitations/${invitationId}`,
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  it('blocks leaving for the last OWNER and asks for the typed name before deleting', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch((url, init) => {
      if (init.method === 'DELETE' && url === `/api/households/${IDS.home}`) return jsonResponse(204);
      return new Promise<Response>(() => undefined);
    });
    const { client, router } = renderHousehold();
    await user.click(screen.getByRole('button', { name: 'Haushalt verwalten' }));
    const sheet = await screen.findByRole('dialog', { name: 'Haushalt verwalten' });
    expect(within(sheet).getByRole('button', { name: 'Haushalt verlassen' })).toBeDisabled();
    expect(within(sheet).getByText(/Du bist die einzige Inhaberin bzw. der einzige Inhaber/)).toBeInTheDocument();
    // Regression (review): the design's bottom sheet always has the cancel pill.
    expect(within(sheet).getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Haushalt löschen' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Haushalt löschen?' });
    const confirm = within(dialog).getByRole('button', { name: 'Löschen' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Name zur Bestätigung: Unser Zuhause'), 'Unser Zuhaus');
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Name zur Bestätigung: Unser Zuhause'), 'e');
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/households/${IDS.home}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(client.getQueryData(queryKeys.me)).toMatchObject({
      households: [{ id: IDS.holiday }],
      activeHouseholdId: null,
    });
  });

  it('lets a MEMBER leave (with confirmation) but neither rename nor delete', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch((url, init) => {
      if (init.method === 'DELETE') return jsonResponse(204);
      return new Promise<Response>(() => undefined);
    });
    const { router } = renderHousehold(withMyRole('MEMBER'));
    await user.click(screen.getByRole('button', { name: 'Haushalt verwalten' }));
    const sheet = await screen.findByRole('dialog', { name: 'Haushalt verwalten' });
    expect(within(sheet).queryByLabelText('Name des Haushalts')).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Haushalt löschen' })).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Haushalt verlassen' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Haushalt verlassen?' });
    await user.click(within(dialog).getByRole('button', { name: 'Verlassen' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/households/${IDS.home}/members/${IDS.julian}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('renames the household (ADMIN+)', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch((_url, init) =>
      init.method === 'PATCH' ? jsonResponse(200, makeHousehold({ name: 'WG Basel' })) : jsonResponse(404),
    );
    const { client } = renderHousehold();
    await user.click(screen.getByRole('button', { name: 'Haushalt verwalten' }));
    const sheet = await screen.findByRole('dialog', { name: 'Haushalt verwalten' });
    const save = within(sheet).getByRole('button', { name: 'Namen speichern' });
    expect(save).toBeDisabled();
    const input = within(sheet).getByLabelText('Name des Haushalts');
    await user.clear(input);
    await user.type(input, 'WG Basel');
    await user.click(save);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'WG Basel' })).toBeInTheDocument());
    expect(bodyOf(fetchMock.mock.calls[0]?.[1])).toEqual({ name: 'WG Basel' });
    expect(client.getQueryData(queryKeys.me)).toMatchObject({
      households: [{ name: 'WG Basel' }, { name: 'Ferienhaus' }],
    });
  });
});

describe('MemberScreen', () => {
  function renderMember(userId: string, detail: HouseholdDetail = makeHousehold()) {
    return renderScreen(<MemberScreen userId={userId} />, {
      path: '/haushalt/mitglieder/:userId',
      route: `/haushalt/mitglieder/${userId}`,
      data: [[queryKeys.household(IDS.home), detail]],
    });
  }

  it('OWNER sees message, role change and removal for a MEMBER', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch((_url, init) =>
      init.method === 'PATCH'
        ? jsonResponse(200, {
            userId: IDS.lisa,
            displayName: 'Lisa',
            role: 'ADMIN',
            joinedAt: '2026-10-02T08:00:00.000Z',
          })
        : jsonResponse(404),
    );
    renderMember(IDS.lisa);
    expect(screen.getByRole('heading', { name: 'Lisa' })).toBeInTheDocument();
    expect(screen.getByText('Mitglied seit 02.10.2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nachricht senden' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aus dem Haushalt entfernen' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rolle ändern, Mitglied' }));
    const sheet = await screen.findByRole('dialog', { name: 'Rolle ändern' });
    expect(within(sheet).getByRole('radio', { name: /^Mitglied/ })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(sheet).getByRole('radio', { name: /^Verwaltung/ }));
    await waitFor(() => expect(bodyOf(fetchMock.mock.calls[0]?.[1])).toEqual({ role: 'ADMIN' }));
    expect(await screen.findByText('Lisa ist jetzt Verwaltung')).toBeInTheDocument();
  });

  it('OWNER removes a member after confirmation and returns to the household', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch((_url, init) =>
      init.method === 'DELETE' ? jsonResponse(204) : new Promise<Response>(() => undefined),
    );
    const { router } = renderMember(IDS.max);
    await user.click(screen.getByRole('button', { name: 'Aus dem Haushalt entfernen' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Max entfernen?' });
    await user.click(within(dialog).getByRole('button', { name: 'Entfernen' }));
    // The screen unmounts once Max is gone – navigation must still happen.
    await waitFor(() => expect(router.state.location.pathname).toBe('/haushalt'));
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/households/${IDS.home}/members/${IDS.max}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(await screen.findByText('Max entfernt')).toBeInTheDocument();
  });

  it('MEMBER sees only "Nachricht senden" for others and opens the direct chat', async () => {
    const user = userEvent.setup();
    const conversationId = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
    const fetchMock = mockFetch((url) =>
      url.endsWith('/conversations/direct') ? jsonResponse(200, { id: conversationId }) : jsonResponse(404),
    );
    const { router } = renderMember(IDS.max, withMyRole('MEMBER'));
    expect(screen.queryByRole('button', { name: /Rolle ändern/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aus dem Haushalt entfernen' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Nachricht senden' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/chats/${conversationId}`));
    expect(bodyOf(fetchMock.mock.calls[0]?.[1])).toEqual({ userId: IDS.max });
  });

  it('explains why the last OWNER cannot leave', () => {
    renderMember(IDS.julian);
    expect(screen.getByRole('heading', { name: 'Julian (Du)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Haushalt verlassen' })).not.toBeInTheDocument();
    expect(screen.getByText(/kannst du den Haushalt nicht verlassen/)).toBeInTheDocument();
  });

  it('shows "not found" for unknown members', () => {
    renderMember('00000000-0000-4000-8000-000000000000');
    expect(screen.getByRole('heading', { name: 'Mitglied nicht gefunden' })).toBeInTheDocument();
  });
});
