import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { apiError, currentUrl, jsonResponse, renderApp, stubFetch, TEST_ME } from './testUtils';

afterEach(() => {
  vi.unstubAllGlobals();
});

async function fillLogin(email: string, password: string) {
  const user = userEvent.setup();
  if (email) await user.type(await screen.findByRole('textbox', { name: 'E-Mail' }), email);
  if (password) await user.type(screen.getByLabelText('Passwort'), password);
  return user;
}

// User-event typing is slow under a full parallel run – allow more than the 5 s default.
describe('LoginForm', { timeout: 20_000 }, () => {
  it('renders the design: large title, labelled fields with autocomplete and the actions', async () => {
    stubFetch(() => jsonResponse(404));
    renderApp('/login', null);
    expect(await screen.findByRole('heading', { level: 1, name: 'Willkommen zurück' })).toBeInTheDocument();
    const email = screen.getByRole('textbox', { name: 'E-Mail' });
    expect(email).toHaveAttribute('autocomplete', 'email');
    expect(email).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Passwort')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByRole('button', { name: 'Anmelden' })).toHaveAttribute('type', 'submit');
    expect(screen.getByRole('link', { name: 'Passwort vergessen?' })).toHaveAttribute('href', '/passwort-vergessen');
    expect(screen.getByRole('link', { name: 'Konto erstellen' })).toHaveAttribute('href', '/registrieren');
  });

  it('shows German validation messages without calling the server', async () => {
    const requests = stubFetch(() => jsonResponse(404));
    renderApp('/login', null);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Anmelden' }));

    expect(await screen.findByText('Bitte gib deine E-Mail-Adresse ein.')).toBeInTheDocument();
    expect(screen.getByText('Bitte gib dein Passwort ein.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'E-Mail' })).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'E-Mail' })).toHaveAttribute('aria-invalid', 'true');

    await user.type(screen.getByRole('textbox', { name: 'E-Mail' }), 'kein-mail');
    expect(screen.getByText('Bitte gib eine gültige E-Mail-Adresse ein.')).toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: 'E-Mail' }));
    await user.type(screen.getByRole('textbox', { name: 'E-Mail' }), 'julia@example.ch');
    expect(screen.queryByText('Bitte gib eine gültige E-Mail-Adresse ein.')).not.toBeInTheDocument();

    expect(requests.filter((request) => request.url.includes('/auth/login'))).toHaveLength(0);
  });

  it('shows and hides the password', async () => {
    stubFetch(() => jsonResponse(404));
    renderApp('/login', null);
    const user = await fillLogin('', 'Geheim-12345');
    const input = screen.getByLabelText('Passwort');
    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Passwort anzeigen' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Passwort ausblenden' })).toHaveTextContent('Ausblenden');
    await user.click(screen.getByRole('button', { name: 'Passwort ausblenden' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('moves from the e-mail to the password field on Enter, then Enter submits', async () => {
    const requests = stubFetch(({ url }) =>
      url.endsWith('/api/auth/login')
        ? apiError(401, 'INVALID_CREDENTIALS', 'E-Mail oder Passwort ist falsch.')
        : jsonResponse(404),
    );
    renderApp('/login', null);
    const user = userEvent.setup();
    await user.type(await screen.findByRole('textbox', { name: 'E-Mail' }), 'julia@example.ch{Enter}');
    expect(screen.getByLabelText('Passwort')).toHaveFocus();
    expect(requests.some((request) => request.url.endsWith('/api/auth/login'))).toBe(false);
    await user.keyboard('Falsch-12345{Enter}');
    await waitFor(() => expect(requests.some((request) => request.url.endsWith('/api/auth/login'))).toBe(true));
  });

  it('shows the generic error for wrong credentials and keeps the user on the page', async () => {
    const requests = stubFetch(({ url }) =>
      url.endsWith('/api/auth/login')
        ? apiError(401, 'INVALID_CREDENTIALS', 'E-Mail oder Passwort ist falsch.')
        : jsonResponse(404),
    );
    const { router } = renderApp('/login', null);
    const user = await fillLogin('julia@example.ch', 'Falsch-12345');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('E-Mail oder Passwort ist falsch.');
    expect(router.state.location.pathname).toBe('/login');
    const login = requests.find((request) => request.url.endsWith('/api/auth/login'));
    expect(login?.method).toBe('POST');
    expect(login?.body).toEqual({ email: 'julia@example.ch', password: 'Falsch-12345' });
    expect(login?.headers.get('X-Homi-Request')).toBe('1');

    // Typing again clears the message.
    await user.type(screen.getByLabelText('Passwort'), 'x');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows rate limiting and network problems as form messages', async () => {
    stubFetch(({ url }) =>
      url.endsWith('/api/auth/login')
        ? apiError(429, 'RATE_LIMITED', 'Zu viele Anfragen. Bitte versuche es gleich nochmals.')
        : jsonResponse(404),
    );
    renderApp('/login', null);
    const user = await fillLogin('julia@example.ch', 'Geheim-12345');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Zu viele Anfragen. Bitte versuche es gleich nochmals.');
  });

  it('continues to the validated ?redirect= target after logging in (e.g. an invitation)', async () => {
    stubFetch(({ url }) => (url.endsWith('/api/auth/login') ? jsonResponse(200, TEST_ME) : jsonResponse(404)));
    const target = '/einladung/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd';
    const { router } = renderApp(`/login?redirect=${encodeURIComponent(target)}`, null);
    expect(await screen.findByRole('link', { name: 'Konto erstellen' })).toHaveAttribute(
      'href',
      `/registrieren?redirect=${encodeURIComponent(target)}`,
    );
    const user = await fillLogin('julia@example.ch', 'Geheim-12345');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(target));
  });

  it('keeps ?redirect= across "Passwort vergessen?" and back to the login', async () => {
    stubFetch(({ url }) =>
      url.endsWith('/api/auth/config') ? jsonResponse(200, { passwordResetEnabled: true }) : jsonResponse(404),
    );
    const target = '/einladung/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd';
    const query = `?redirect=${encodeURIComponent(target)}`;
    const { router } = renderApp(`/login${query}`, null);
    const forgot = await screen.findByRole('link', { name: 'Passwort vergessen?' });
    expect(forgot).toHaveAttribute('href', `/passwort-vergessen${query}`);

    const user = userEvent.setup();
    await user.click(forgot);
    await waitFor(() => expect(currentUrl(router)).toBe(`/passwort-vergessen${query}`));
    expect(await screen.findByRole('button', { name: 'Link senden' })).toBeInTheDocument();
  });

  it('never forwards to a foreign redirect target', async () => {
    stubFetch(({ url }) => (url.endsWith('/api/auth/login') ? jsonResponse(200, TEST_ME) : jsonResponse(404)));
    const { router } = renderApp(`/login?redirect=${encodeURIComponent('https://evil.example/phish')}`, null);
    // The unsafe target is not carried over to the registration / forgot-password links either.
    expect(await screen.findByRole('link', { name: 'Konto erstellen' })).toHaveAttribute('href', '/registrieren');
    expect(screen.getByRole('link', { name: 'Passwort vergessen?' })).toHaveAttribute('href', '/passwort-vergessen');
    const user = await fillLogin('julia@example.ch', 'Geheim-12345');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));
    await waitFor(() => expect(currentUrl(router)).toBe('/'));
  });
});
