import { create } from 'zustand';

/**
 * Appearance preferences (Einstellungen › Darstellung).
 *
 * - `appearance`: `system` follows `prefers-color-scheme`; `light` / `dark` force a mode via
 *   `<html data-theme="…">` (see tokens.css).
 * - `reduceTransparency`: Liquid Glass becomes (almost) opaque via `<html data-transparency="reduced">`.
 *
 * Persisted in localStorage (UI preference only – never auth data). `public/theme-boot.js`
 * applies the stored value before first paint and must stay in sync with `applyThemePreferences`.
 */
export type Appearance = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

export interface ThemePreferences {
  appearance: Appearance;
  reduceTransparency: boolean;
}

export const THEME_STORAGE_KEY = 'homi.appearance';

/** `--color-bg` per scheme; used for `<meta name="theme-color">`. */
export const THEME_COLORS: Readonly<Record<ColorScheme, string>> = { light: '#F7F6F3', dark: '#0E0E10' };

export const DEFAULT_THEME_PREFERENCES: Readonly<ThemePreferences> = Object.freeze({
  appearance: 'system',
  reduceTransparency: false,
});

const APPEARANCES: readonly Appearance[] = ['system', 'light', 'dark'];

function isAppearance(value: unknown): value is Appearance {
  return typeof value === 'string' && (APPEARANCES as readonly string[]).includes(value);
}

function defaultStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null; // e.g. Safari with storage blocked
  }
}

/** Parses a stored value defensively; anything unexpected falls back to the defaults. */
export function parseThemePreferences(raw: string | null): ThemePreferences {
  if (!raw) return { ...DEFAULT_THEME_PREFERENCES };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_THEME_PREFERENCES };
    const record = parsed as Record<string, unknown>;
    return {
      appearance: isAppearance(record.appearance) ? record.appearance : DEFAULT_THEME_PREFERENCES.appearance,
      reduceTransparency: record.reduceTransparency === true,
    };
  } catch {
    return { ...DEFAULT_THEME_PREFERENCES };
  }
}

export function loadThemePreferences(storage: Storage | null = defaultStorage()): ThemePreferences {
  try {
    return parseThemePreferences(storage?.getItem(THEME_STORAGE_KEY) ?? null);
  } catch {
    return { ...DEFAULT_THEME_PREFERENCES };
  }
}

export function saveThemePreferences(prefs: ThemePreferences, storage: Storage | null = defaultStorage()): void {
  try {
    storage?.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ appearance: prefs.appearance, reduceTransparency: prefs.reduceTransparency }),
    );
  } catch {
    // Quota exceeded / storage blocked: the preference simply is not remembered.
  }
}

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

export function resolveColorScheme(appearance: Appearance, prefersDark: boolean = systemPrefersDark()): ColorScheme {
  if (appearance === 'system') return prefersDark ? 'dark' : 'light';
  return appearance;
}

/** Writes the preferences to `<html>` attributes and the theme-color metas. */
export function applyThemePreferences(prefs: ThemePreferences, doc: Document = document): void {
  const root = doc.documentElement;
  if (prefs.appearance === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', prefs.appearance);

  if (prefs.reduceTransparency) root.setAttribute('data-transparency', 'reduced');
  else root.removeAttribute('data-transparency');

  doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    if (prefs.appearance !== 'system') {
      meta.content = THEME_COLORS[prefs.appearance];
    } else {
      // Restore the media-specific defaults from index.html.
      meta.content = /dark/.test(meta.getAttribute('media') ?? '') ? THEME_COLORS.dark : THEME_COLORS.light;
    }
  });
}

interface ThemeStore extends ThemePreferences {
  setAppearance: (appearance: Appearance) => void;
  setReduceTransparency: (reduce: boolean) => void;
}

function commit(prefs: ThemePreferences): void {
  saveThemePreferences(prefs);
  if (typeof document !== 'undefined') applyThemePreferences(prefs);
}

export const useThemeStore = create<ThemeStore>()((set, get) => ({
  ...loadThemePreferences(),
  setAppearance: (appearance) => {
    set({ appearance });
    commit({ appearance, reduceTransparency: get().reduceTransparency });
  },
  setReduceTransparency: (reduceTransparency) => {
    set({ reduceTransparency });
    commit({ appearance: get().appearance, reduceTransparency });
  },
}));

/**
 * Applies the stored preferences and keeps other tabs/windows in sync.
 * Returns a cleanup function.
 */
export function initTheme(): () => void {
  const { appearance, reduceTransparency } = useThemeStore.getState();
  applyThemePreferences({ appearance, reduceTransparency });

  const onStorage = (event: StorageEvent): void => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    const next = parseThemePreferences(event.newValue);
    useThemeStore.setState(next);
    applyThemePreferences(next);
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
