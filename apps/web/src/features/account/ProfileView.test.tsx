import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MeResponse } from '@homi/shared';
import { queryKeys } from '@/api/queryKeys';
import { useToastStore } from '@/components';
import { useSessionUiStore } from '@/hooks/useAuth';
import { apiError, jsonResponse, renderApp, stubFetch, TEST_ME } from '@/features/auth/testUtils';

afterEach(() => {
  vi.unstubAllGlobals();
  useToastStore.setState({ current: null });
  useSessionUiStore.setState({ explicitLogout: false });
});

// User-event typing is slow under a full parallel run – allow more than the 5 s default.
describe('ProfileView', { timeout: 20_000 }, () => {
  it('shows the account like screen 09: avatar, name, e-mail and grouped rows', async () => {
    stubFetch(() => jsonResponse(404));
    renderApp('/profil', TEST_ME);
    expect(await screen.findByRole('heading', { level: 1, name: 'Profil' })).toBeInTheDocument();
    const hero = screen.getByRole('region', { name: 'Dein Profil' });
    expect(within(hero).getByRole('heading', { name: 'Julia' })).toBeInTheDocument();
    expect(within(hero).getByText('julia@example.ch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anzeigename, Julia' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Passwort ändern' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Einstellungen' })).toHaveAttribute('href', '/einstellungen');
    expect(screen.getByRole('link', { name: 'Haushalt' })).toHaveAttribute('href', '/haushalt');
    expect(screen.getByRole('button', { name: 'Zurück' })).toBeInTheDocument();
  });

  it('edits the display name in a sheet and updates the session data', async () => {
    const renamed: MeResponse = { ...TEST_ME, user: { ...TEST_ME.user, displayName: 'Julia Meier' } };
    const requests = stubFetch(({ url, method }) =>
      url.endsWith('/api/account') && method === 'PATCH' ? jsonResponse(200, renamed) : jsonResponse(404),
    );
    const { client } = renderApp('/profil', TEST_ME);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Anzeigename, Julia' }));

    const sheet = await screen.findByRole('dialog', { name: 'Anzeigename ändern' });
    const field = within(sheet).getByRole('textbox', { name: 'Anzeigename' });
    expect(field).toHaveValue('Julia');
    expect(within(sheet).getByRole('button', { name: 'Speichern' })).toBeDisabled();

    await user.clear(field);
    await user.click(within(sheet).getByRole('button', { name: 'Speichern' }));
    await user.type(field, ' ');
    await user.clear(field);
    await user.type(field, 'Julia Meier');
    await user.click(within(sheet).getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Anzeigename ändern' })).not.toBeInTheDocument());
    const patch = requests.find((request) => request.method === 'PATCH');
    expect(patch?.body).toEqual({ displayName: 'Julia Meier' });
    expect(patch?.headers.get('X-Homi-Request')).toBe('1');
    expect(client.getQueryData<MeResponse>(queryKeys.me)?.user.displayName).toBe('Julia Meier');
    expect(screen.getByRole('region', { name: 'Dein Profil' })).toHaveTextContent('Julia Meier');
    expect(useToastStore.getState().current).toMatchObject({ message: 'Name gespeichert' });
  });

  it('rejects invisible or control-character names in the sheet without a request', async () => {
    const requests = stubFetch(() => jsonResponse(404));
    renderApp('/profil', TEST_ME);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Anzeigename, Julia' }));
    const sheet = await screen.findByRole('dialog', { name: 'Anzeigename ändern' });
    const field = within(sheet).getByRole('textbox', { name: 'Anzeigename' });

    await user.clear(field);
    await user.type(field, '​​');
    await user.click(within(sheet).getByRole('button', { name: 'Speichern' }));
    expect(await within(sheet).findByText('Bitte gib deinen Namen ein.')).toBeInTheDocument();

    await user.clear(field);
    await user.type(field, 'Admin‮gnp');
    await user.click(within(sheet).getByRole('button', { name: 'Speichern' }));
    expect(await within(sheet).findByText('Der Name enthält unzulässige Zeichen.')).toBeInTheDocument();
    expect(field).toHaveFocus();
    expect(requests.some((request) => request.method === 'PATCH')).toBe(false);
  });

  it('asks before discarding an edited name', async () => {
    stubFetch(() => jsonResponse(404));
    renderApp('/profil', TEST_ME);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Anzeigename, Julia' }));
    const sheet = await screen.findByRole('dialog', { name: 'Anzeigename ändern' });
    await user.type(within(sheet).getByRole('textbox', { name: 'Anzeigename' }), 'na');
    await user.click(within(sheet).getByRole('button', { name: 'Schliessen' }));
    expect(await screen.findByRole('alertdialog', { name: 'Änderungen verwerfen?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Verwerfen' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Anzeigename ändern' })).not.toBeInTheDocument());
  });

  it('changes the password: validation, wrong current password, success', async () => {
    let attempts = 0;
    const requests = stubFetch(({ url }) => {
      if (!url.endsWith('/api/account/password')) return jsonResponse(404);
      attempts += 1;
      return attempts === 1 ? apiError(400, 'WRONG_PASSWORD', 'Das aktuelle Passwort ist falsch.') : jsonResponse(204);
    });
    renderApp('/profil', TEST_ME);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Passwort ändern' }));
    const sheet = await screen.findByRole('dialog', { name: 'Passwort ändern' });
    const current = within(sheet).getByLabelText('Aktuelles Passwort', { selector: 'input' });
    const next = within(sheet).getByLabelText('Neues Passwort', { selector: 'input' });
    const confirm = within(sheet).getByLabelText('Neues Passwort bestätigen', { selector: 'input' });
    expect(current).toHaveAttribute('autocomplete', 'current-password');
    expect(next).toHaveAttribute('autocomplete', 'new-password');

    await user.type(current, 'Alt-Passwort-1');
    await user.type(next, 'julia@example.ch');
    await user.type(confirm, 'julia@example.ch');
    await user.click(within(sheet).getByRole('button', { name: 'Passwort ändern' }));
    expect(within(sheet).getByText('Das Passwort darf nicht deiner E-Mail-Adresse entsprechen.')).toBeInTheDocument();

    await user.clear(next);
    await user.type(next, 'Neu-Passwort-2');
    expect(within(sheet).getByText('Die Passwörter stimmen nicht überein.')).toBeInTheDocument();
    await user.clear(confirm);
    await user.type(confirm, 'Neu-Passwort-2');
    expect(requests).toHaveLength(0);

    await user.click(within(sheet).getByRole('button', { name: 'Passwort ändern' }));
    expect(await within(sheet).findByText('Das aktuelle Passwort ist falsch.')).toBeInTheDocument();
    expect(current).toHaveFocus();

    await user.clear(current);
    await user.type(current, 'Richtig-Passwort-1');
    await user.click(within(sheet).getByRole('button', { name: 'Passwort ändern' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Passwort ändern' })).not.toBeInTheDocument());
    expect(requests.at(-1)?.body).toEqual({ currentPassword: 'Richtig-Passwort-1', newPassword: 'Neu-Passwort-2' });
    expect(useToastStore.getState().current).toMatchObject({ message: 'Passwort geändert', tone: 'success' });
  });

  it('logs out after confirmation and returns to a plain /login', async () => {
    const requests = stubFetch(({ url }) => (url.endsWith('/api/auth/logout') ? jsonResponse(204) : jsonResponse(404)));
    const { router, client } = renderApp('/profil', TEST_ME);
    client.setQueryData(queryKeys.dashboard(TEST_ME.households[0]!.id), { cached: true });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Abmelden' }));

    const dialog = await screen.findByRole('alertdialog', { name: 'Abmelden?' });
    expect(requests).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Abmelden' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toBe('');
    expect(requests.find((request) => request.url.endsWith('/api/auth/logout'))?.method).toBe('POST');
    expect(client.getQueryData(queryKeys.me)).toBeNull();
    expect(client.getQueryData(queryKeys.dashboard(TEST_ME.households[0]!.id))).toBeUndefined();
    expect(await screen.findByRole('heading', { level: 1, name: 'Willkommen zurück' })).toBeInTheDocument();
  });

  it('keeps the session and explains the problem when logging out fails', async () => {
    stubFetch(({ url }) =>
      url.endsWith('/api/auth/logout') ? Promise.reject(new TypeError('Failed to fetch')) : jsonResponse(404),
    );
    const { router } = renderApp('/profil', TEST_ME);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Abmelden' }));
    await user.click(
      within(await screen.findByRole('alertdialog', { name: 'Abmelden?' })).getByRole('button', { name: 'Abmelden' }),
    );
    await waitFor(() =>
      expect(useToastStore.getState().current).toMatchObject({
        tone: 'error',
        message: 'Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.',
      }),
    );
    expect(router.state.location.pathname).toBe('/profil');
  });
});
