import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jsonResponse, renderApp, stubFetch, TEST_ME } from '@/features/auth/testUtils';
import { DEFAULT_THEME_PREFERENCES, THEME_STORAGE_KEY, useThemeStore } from '@/lib/theme';
import packageJson from '../../../package.json';
import { APP_VERSION } from './appVersion';

afterEach(() => {
  vi.unstubAllGlobals();
  useThemeStore.setState({ ...DEFAULT_THEME_PREFERENCES });
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-transparency');
});

// User-event typing is slow under a full parallel run – allow more than the 5 s default.
describe('SettingsView', { timeout: 20_000 }, () => {
  it('switches the appearance (Automatisch / Hell / Dunkel) and remembers it on the device', async () => {
    stubFetch(() => jsonResponse(404));
    renderApp('/einstellungen', TEST_ME);
    const user = userEvent.setup();
    expect(await screen.findByRole('heading', { level: 1, name: 'Einstellungen' })).toBeInTheDocument();

    const group = screen.getByRole('radiogroup', { name: 'Erscheinungsbild' });
    expect(screen.getByRole('radio', { name: 'Automatisch' })).toBeChecked();
    expect(group).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Dunkel' }));
    expect(useThemeStore.getState().appearance).toBe('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(JSON.parse(window.localStorage.getItem(THEME_STORAGE_KEY) ?? '{}')).toMatchObject({ appearance: 'dark' });

    await user.click(screen.getByRole('radio', { name: 'Automatisch' }));
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });

  it('toggles "Transparenz reduzieren" with a switch', async () => {
    stubFetch(() => jsonResponse(404));
    renderApp('/einstellungen', TEST_ME);
    const user = userEvent.setup();
    const toggle = await screen.findByRole('switch', { name: 'Transparenz reduzieren' });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(toggle).toBeChecked();
    expect(useThemeStore.getState().reduceTransparency).toBe(true);
    expect(document.documentElement).toHaveAttribute('data-transparency', 'reduced');
    await user.keyboard(' ');
    expect(toggle).not.toBeChecked();
  });

  it('explains the system motion setting, links to Profil/Haushalt and shows the version', async () => {
    stubFetch(() => jsonResponse(404));
    renderApp('/einstellungen', TEST_ME);
    expect(await screen.findByText('Bewegung reduzieren')).toBeInTheDocument();
    expect(screen.getByText('Aus')).toBeInTheDocument();
    expect(screen.getByText(/folgt der Systemeinstellung «Bewegung reduzieren»/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Profil' })).toHaveAttribute('href', '/profil');
    expect(screen.getByRole('link', { name: 'Haushalt' })).toHaveAttribute('href', '/haushalt');
    expect(screen.getByText(APP_VERSION)).toBeInTheDocument();
  });

  it('shows the version of the web package', () => {
    expect(APP_VERSION).toBe(packageJson.version);
  });
});
