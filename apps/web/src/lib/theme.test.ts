import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bootScript from '../../public/theme-boot.js?raw';
import {
  applyThemePreferences,
  DEFAULT_THEME_PREFERENCES,
  loadThemePreferences,
  parseThemePreferences,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  useThemeStore,
  type ThemePreferences,
} from './theme';

const root = document.documentElement;

function addThemeColorMetas(): void {
  document.head.innerHTML = `
    <meta name="theme-color" content="${THEME_COLORS.light}" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="${THEME_COLORS.dark}" media="(prefers-color-scheme: dark)">`;
}

function metaContents(): string[] {
  return Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')).map((m) => m.content);
}

function resetDom(): void {
  root.removeAttribute('data-theme');
  root.removeAttribute('data-transparency');
  addThemeColorMetas();
}

beforeEach(() => {
  resetDom();
  useThemeStore.setState({ ...DEFAULT_THEME_PREFERENCES });
});

afterEach(() => {
  window.localStorage.clear();
});

describe('theme persistence', () => {
  it('persists a forced appearance and applies it to <html> and the theme-color metas', () => {
    useThemeStore.getState().setAppearance('dark');

    expect(JSON.parse(window.localStorage.getItem(THEME_STORAGE_KEY) ?? 'null')).toEqual({
      appearance: 'dark',
      reduceTransparency: false,
    });
    expect(root.dataset.theme).toBe('dark');
    expect(metaContents()).toEqual([THEME_COLORS.dark, THEME_COLORS.dark]);
  });

  it('"system" removes the override and restores the media-specific theme colours', () => {
    useThemeStore.getState().setAppearance('light');
    useThemeStore.getState().setAppearance('system');

    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(metaContents()).toEqual([THEME_COLORS.light, THEME_COLORS.dark]);
    expect(loadThemePreferences().appearance).toBe('system');
  });

  it('persists reduced transparency independently of the appearance', () => {
    useThemeStore.getState().setAppearance('dark');
    useThemeStore.getState().setReduceTransparency(true);

    expect(root.dataset.transparency).toBe('reduced');
    expect(loadThemePreferences()).toEqual({ appearance: 'dark', reduceTransparency: true });

    useThemeStore.getState().setReduceTransparency(false);
    expect(root.hasAttribute('data-transparency')).toBe(false);
  });

  it('restores the stored preferences on the next load', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ appearance: 'light', reduceTransparency: true }));
    expect(loadThemePreferences()).toEqual({ appearance: 'light', reduceTransparency: true });
  });

  it('falls back to the defaults for corrupt or unknown values', () => {
    expect(parseThemePreferences('{not json')).toEqual(DEFAULT_THEME_PREFERENCES);
    expect(parseThemePreferences(JSON.stringify({ appearance: 'sepia', reduceTransparency: 'yes' }))).toEqual(
      DEFAULT_THEME_PREFERENCES,
    );
    expect(parseThemePreferences(null)).toEqual(DEFAULT_THEME_PREFERENCES);
  });

  it('survives blocked storage (Safari private mode)', () => {
    const blocked = {
      getItem: vi.fn(() => {
        throw new DOMException('denied', 'SecurityError');
      }),
      setItem: vi.fn(() => {
        throw new DOMException('denied', 'QuotaExceededError');
      }),
    } as unknown as Storage;
    expect(loadThemePreferences(blocked)).toEqual(DEFAULT_THEME_PREFERENCES);
  });
});

describe('public/theme-boot.js (pre-paint bootstrap)', () => {
  const runBootScript = (): void => {
    new Function(bootScript)();
  };

  const cases: ThemePreferences[] = [
    { appearance: 'dark', reduceTransparency: false },
    { appearance: 'light', reduceTransparency: true },
    { appearance: 'system', reduceTransparency: true },
    { appearance: 'system', reduceTransparency: false },
  ];

  it.each(cases)('produces the same DOM state as applyThemePreferences for %o', (prefs) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(prefs));
    runBootScript();
    const booted = {
      theme: root.getAttribute('data-theme'),
      transparency: root.getAttribute('data-transparency'),
      metas: metaContents(),
    };

    resetDom();
    applyThemePreferences(prefs);
    expect(booted).toEqual({
      theme: root.getAttribute('data-theme'),
      transparency: root.getAttribute('data-transparency'),
      metas: metaContents(),
    });
  });

  it('does nothing without stored preferences and never throws on corrupt data', () => {
    runBootScript();
    expect(root.hasAttribute('data-theme')).toBe(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, '{oops');
    expect(runBootScript).not.toThrow();
    expect(root.hasAttribute('data-theme')).toBe(false);
  });
});
