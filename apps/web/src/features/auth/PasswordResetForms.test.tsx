import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { queryKeys } from '@/api/queryKeys';
import { useToastStore } from '@/components';
import { RESET_DISABLED_MESSAGE, RESET_REQUESTED_MESSAGE } from './messages';
import { apiError, jsonResponse, renderApp, stubFetch, TEST_ME } from './testUtils';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd';

afterEach(() => {
  vi.unstubAllGlobals();
  useToastStore.setState({ current: null });
});

// User-event typing is slow under a full parallel run – allow more than the 5 s default.
describe('ForgotPasswordForm', { timeout: 20_000 }, () => {
  it('requests a link and always ends with the same neutral confirmation', async () => {
    const requests = stubFetch(({ url }) => {
      if (url.endsWith('/api/auth/config')) return jsonResponse(200, { passwordResetEnabled: true });
      if (url.endsWith('/api/auth/password-reset/request')) return jsonResponse(202);
      return jsonResponse(404);
    });
    renderApp('/passwort-vergessen', null);
    const user = userEvent.setup();
    expect(await screen.findByRole('heading', { level: 1, name: 'Passwort vergessen' })).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Link senden' }));
    expect(await screen.findByText('Bitte gib deine E-Mail-Adresse ein.')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'E-Mail' }), 'niemand@example.ch{Enter}');
    expect(await screen.findByRole('heading', { name: 'Schau in dein Postfach' })).toBeInTheDocument();
    expect(screen.getByText(RESET_REQUESTED_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zur Anmeldung' })).toHaveAttribute('href', '/login');
    expect(requests.find((request) => request.url.endsWith('/password-reset/request'))?.body).toEqual({
      email: 'niemand@example.ch',
    });
  });

  it('explains that reset by e-mail is not set up when the server has no mail delivery', async () => {
    const requests = stubFetch(({ url }) =>
      url.endsWith('/api/auth/config') ? jsonResponse(200, { passwordResetEnabled: false }) : jsonResponse(404),
    );
    renderApp('/passwort-vergessen', null);
    expect(await screen.findByText(RESET_DISABLED_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'E-Mail' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zurück zur Anmeldung' })).toHaveAttribute('href', '/login');
    expect(requests.some((request) => request.url.includes('password-reset'))).toBe(false);
  });

  it('leads back to the login with the original ?redirect= target', async () => {
    const target = '/einladung/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd';
    const loginHref = `/login?redirect=${encodeURIComponent(target)}`;
    let enabled = true;
    stubFetch(({ url }) => {
      if (url.endsWith('/api/auth/config')) return jsonResponse(200, { passwordResetEnabled: enabled });
      if (url.endsWith('/api/auth/password-reset/request')) return jsonResponse(202);
      return jsonResponse(404);
    });
    renderApp(`/passwort-vergessen?redirect=${encodeURIComponent(target)}`, null);
    const user = userEvent.setup();
    await user.type(await screen.findByRole('textbox', { name: 'E-Mail' }), 'julia@example.ch{Enter}');
    expect(await screen.findByRole('link', { name: 'Zur Anmeldung' })).toHaveAttribute('href', loginHref);
    cleanup();

    enabled = false;
    renderApp(`/passwort-vergessen?redirect=${encodeURIComponent(target)}`, null);
    expect(await screen.findByRole('link', { name: 'Zurück zur Anmeldung' })).toHaveAttribute('href', loginHref);
  });

  it('shows the rate-limit message from the server', async () => {
    stubFetch(({ url }) => {
      if (url.endsWith('/api/auth/config')) return jsonResponse(200, { passwordResetEnabled: true });
      if (url.endsWith('/password-reset/request')) {
        return apiError(429, 'RATE_LIMITED', 'Zu viele Anfragen. Bitte versuche es gleich nochmals.');
      }
      return jsonResponse(404);
    });
    renderApp('/passwort-vergessen', null);
    const user = userEvent.setup();
    await user.type(await screen.findByRole('textbox', { name: 'E-Mail' }), 'julia@example.ch{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Zu viele Anfragen');
  });
});

// User-event typing is slow under a full parallel run – allow more than the 5 s default.
describe('ResetPasswordForm', { timeout: 20_000 }, () => {
  it('checks the policy and the confirmation before sending', async () => {
    const requests = stubFetch(() => jsonResponse(404));
    renderApp(`/passwort-zuruecksetzen/${TOKEN}`, null);
    const user = userEvent.setup();
    expect(await screen.findByRole('heading', { level: 1, name: 'Neues Passwort' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Neues Passwort', { selector: 'input' }), 'nurbuchstaben');
    await user.click(screen.getByRole('button', { name: 'Passwort speichern' }));
    expect(
      await screen.findByText('Das Passwort muss mindestens eine Ziffer oder ein Sonderzeichen enthalten.'),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Neues Passwort', { selector: 'input' }), '-7');
    await user.type(screen.getByLabelText('Passwort bestätigen'), 'anders-123');
    expect(screen.getByText('Die Passwörter stimmen nicht überein.')).toBeInTheDocument();
    expect(requests.some((request) => request.url.includes('password-reset'))).toBe(false);
  });

  it('saves the new password, drops the local session and continues to the login', async () => {
    const requests = stubFetch(({ url }) => {
      if (url.endsWith('/password-reset/confirm')) return jsonResponse(204);
      if (url.endsWith('/api/auth/me')) return apiError(401, 'UNAUTHORIZED', 'Bitte melde dich an.');
      return jsonResponse(404);
    });
    // A signed-in user opening the link: their sessions are revoked by the server.
    const { router, client } = renderApp(`/passwort-zuruecksetzen/${TOKEN}`, TEST_ME);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Neues Passwort', { selector: 'input' }), 'Herbst-Laub-2027');
    await user.type(screen.getByLabelText('Passwort bestätigen'), 'Herbst-Laub-2027{Enter}');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(requests.find((request) => request.url.endsWith('/password-reset/confirm'))?.body).toEqual({
      token: TOKEN,
      password: 'Herbst-Laub-2027',
    });
    expect(useToastStore.getState().current).toMatchObject({ message: 'Passwort geändert', tone: 'success' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Willkommen zurück' })).toBeInTheDocument();
    expect(client.getQueryData(queryKeys.me)).toBeNull();
  });

  it('turns an expired or used link into a "request a new link" state', async () => {
    stubFetch(({ url }) =>
      url.endsWith('/password-reset/confirm')
        ? apiError(400, 'INVALID_TOKEN', 'Der Link ist ungültig oder abgelaufen.')
        : jsonResponse(404),
    );
    renderApp(`/passwort-zuruecksetzen/${TOKEN}`, null);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Neues Passwort', { selector: 'input' }), 'Herbst-Laub-2027');
    await user.type(screen.getByLabelText('Passwort bestätigen'), 'Herbst-Laub-2027');
    await user.click(screen.getByRole('button', { name: 'Passwort speichern' }));
    expect(await screen.findByRole('heading', { name: 'Link ungültig' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Neuen Link anfordern' })).toHaveAttribute('href', '/passwort-vergessen');
  });

  it('rejects malformed links without a request', async () => {
    const requests = stubFetch(() => jsonResponse(404));
    renderApp('/passwort-zuruecksetzen/kaputt', null);
    expect(await screen.findByRole('heading', { name: 'Link ungültig' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Neues Passwort', { selector: 'input' })).not.toBeInTheDocument();
    expect(requests.some((request) => request.url.includes('password-reset'))).toBe(false);
  });
});
