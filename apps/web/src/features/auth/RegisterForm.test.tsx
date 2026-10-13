import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiError, jsonResponse, renderApp, stubFetch, TEST_ME } from './testUtils';

afterEach(() => {
  vi.unstubAllGlobals();
});

function policyItem(name: RegExp) {
  const list = screen.getByRole('list', { name: 'Anforderungen an das Passwort' });
  return within(list).getByText(name).closest('li');
}

// User-event typing is slow under a full parallel run – allow more than the 5 s default.
describe('RegisterForm', { timeout: 20_000 }, () => {
  it('shows live password policy hints while typing', async () => {
    stubFetch(() => jsonResponse(404));
    renderApp('/registrieren', null);
    const user = userEvent.setup();
    expect(await screen.findByRole('heading', { level: 1, name: 'Konto erstellen' })).toBeInTheDocument();
    const password = screen.getByLabelText('Passwort');
    expect(password).toHaveAttribute('autocomplete', 'new-password');
    expect(password.getAttribute('aria-describedby')).toBe(
      screen.getByRole('list', { name: 'Anforderungen an das Passwort' }).id,
    );

    expect(policyItem(/Mindestens 10 Zeichen/)).not.toHaveAttribute('data-met');
    expect(policyItem(/Mindestens ein Buchstabe/)).not.toHaveAttribute('data-met');

    await user.type(password, 'sommerwiese');
    expect(policyItem(/Mindestens 10 Zeichen/)).toHaveAttribute('data-met');
    expect(policyItem(/Mindestens ein Buchstabe/)).toHaveAttribute('data-met');
    expect(policyItem(/Ziffer oder ein Sonderzeichen/)).not.toHaveAttribute('data-met');
    expect(policyItem(/Ziffer oder ein Sonderzeichen/)).toHaveTextContent('noch nicht erfüllt');

    await user.type(password, '-7');
    expect(policyItem(/Ziffer oder ein Sonderzeichen/)).toHaveAttribute('data-met');
    expect(policyItem(/Ziffer oder ein Sonderzeichen/)).toHaveTextContent('erfüllt');

    // The e-mail rule appears once an address is entered.
    expect(screen.queryByText('Nicht deine E-Mail-Adresse')).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'E-Mail' }), 'sommerwiese-7@x.ch');
    expect(policyItem(/Nicht deine E-Mail-Adresse/)).toHaveAttribute('data-met');
  });

  it('validates every field with the shared schema before sending', async () => {
    const requests = stubFetch(() => jsonResponse(404));
    renderApp('/registrieren', null);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Passwort'), 'kurz1');
    await user.click(screen.getByRole('button', { name: 'Registrieren' }));

    expect(await screen.findByText('Bitte gib deinen Namen ein.')).toBeInTheDocument();
    expect(screen.getByText('Bitte gib deine E-Mail-Adresse ein.')).toBeInTheDocument();
    expect(screen.getByText('Das Passwort muss mindestens 10 Zeichen lang sein.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Anzeigename' })).toHaveFocus();

    await user.type(screen.getByRole('textbox', { name: 'E-Mail' }), 'lena@example.ch');
    await user.clear(screen.getByLabelText('Passwort'));
    await user.type(screen.getByLabelText('Passwort'), 'LENA@example.ch');
    expect(screen.getByText('Das Passwort darf nicht deiner E-Mail-Adresse entsprechen.')).toBeInTheDocument();

    expect(requests.filter((request) => request.url.endsWith('/api/auth/register'))).toHaveLength(0);
  });

  it('puts "e-mail already taken" on the e-mail field', async () => {
    stubFetch(({ url }) =>
      url.endsWith('/api/auth/register')
        ? apiError(409, 'EMAIL_TAKEN', 'Für diese E-Mail-Adresse existiert bereits ein Konto.')
        : jsonResponse(404),
    );
    renderApp('/registrieren', null);
    const user = userEvent.setup();
    await user.type(await screen.findByRole('textbox', { name: 'Anzeigename' }), 'Lena');
    await user.type(screen.getByRole('textbox', { name: 'E-Mail' }), 'lena@example.ch');
    await user.type(screen.getByLabelText('Passwort'), 'Sommer-Wiese-7');
    await user.click(screen.getByRole('button', { name: 'Registrieren' }));

    const email = screen.getByRole('textbox', { name: 'E-Mail' });
    await waitFor(() => expect(email).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByText('Für diese E-Mail-Adresse existiert bereits ein Konto.')).toBeInTheDocument();
    expect(email).toHaveFocus();
  });

  it('maps server-side validation details onto the fields', async () => {
    stubFetch(({ url }) =>
      url.endsWith('/api/auth/register')
        ? apiError(400, 'VALIDATION', 'Bitte überprüfe deine Eingaben.', {
            fieldErrors: { displayName: 'Der Name darf höchstens 60 Zeichen lang sein.' },
            formErrors: [],
          })
        : jsonResponse(404),
    );
    renderApp('/registrieren', null);
    const user = userEvent.setup();
    await user.type(await screen.findByRole('textbox', { name: 'Anzeigename' }), 'Lena');
    await user.type(screen.getByRole('textbox', { name: 'E-Mail' }), 'lena@example.ch');
    await user.type(screen.getByLabelText('Passwort'), 'Sommer-Wiese-7');
    await user.click(screen.getByRole('button', { name: 'Registrieren' }));
    expect(await screen.findByText('Der Name darf höchstens 60 Zeichen lang sein.')).toBeInTheDocument();
  });

  it('sends new users without a household to /willkommen', async () => {
    const created = { ...TEST_ME, households: [], activeHouseholdId: null };
    const requests = stubFetch(({ url }) =>
      url.endsWith('/api/auth/register') ? jsonResponse(201, created) : jsonResponse(404),
    );
    const { router } = renderApp('/registrieren', null);
    const user = userEvent.setup();
    await user.type(await screen.findByRole('textbox', { name: 'Anzeigename' }), '  Lena  ');
    await user.type(screen.getByRole('textbox', { name: 'E-Mail' }), 'Lena@Example.ch');
    await user.type(screen.getByLabelText('Passwort'), 'Sommer-Wiese-7{Enter}');

    await waitFor(() => expect(router.state.location.pathname).toBe('/willkommen'));
    expect(requests.find((request) => request.url.endsWith('/api/auth/register'))?.body).toEqual({
      displayName: '  Lena  ',
      email: 'Lena@Example.ch',
      password: 'Sommer-Wiese-7',
    });
  });

  it('keeps the redirect target (invitation) across the auth pages and follows it', async () => {
    stubFetch(({ url }) => (url.endsWith('/api/auth/register') ? jsonResponse(201, TEST_ME) : jsonResponse(404)));
    const target = '/einladung/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd';
    const { router } = renderApp(`/registrieren?redirect=${encodeURIComponent(target)}`, null);
    expect(await screen.findByRole('link', { name: 'Anmelden' })).toHaveAttribute(
      'href',
      `/login?redirect=${encodeURIComponent(target)}`,
    );
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'Anzeigename' }), 'Lena');
    await user.type(screen.getByRole('textbox', { name: 'E-Mail' }), 'lena@example.ch');
    await user.type(screen.getByLabelText('Passwort'), 'Sommer-Wiese-7');
    await user.click(screen.getByRole('button', { name: 'Registrieren' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(target));
  });
});
