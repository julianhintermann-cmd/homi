import type { IconName } from '@/icons/paths';

/** German route paths (ARCHITECTURE §7). Use these helpers instead of string literals. */
export const paths = {
  home: '/',
  inventory: '/inventar',
  inventoryNew: '/inventar/neu',
  inventoryItem: (id: string) => `/inventar/${encodeURIComponent(id)}`,
  inventoryEdit: (id: string) => `/inventar/${encodeURIComponent(id)}/bearbeiten`,
  shopping: '/einkauf',
  chats: '/chats',
  conversation: (conversationId: string) => `/chats/${encodeURIComponent(conversationId)}`,
  household: '/haushalt',
  member: (userId: string) => `/haushalt/mitglieder/${encodeURIComponent(userId)}`,
  profile: '/profil',
  settings: '/einstellungen',
  welcome: '/willkommen',
  login: '/login',
  register: '/registrieren',
  forgotPassword: '/passwort-vergessen',
  resetPassword: (token: string) => `/passwort-zuruecksetzen/${encodeURIComponent(token)}`,
  invitation: (token: string) => `/einladung/${encodeURIComponent(token)}`,
  designGallery: '/__design',
} as const;

export type TabKey = 'home' | 'inventory' | 'shopping' | 'chats';

export interface TabDefinition {
  key: TabKey;
  label: string;
  icon: IconName;
  path: string;
}

/** The four tab-bar destinations in design order ("Tab Bar (Liquid Glass)"). */
export const TABS: readonly TabDefinition[] = [
  { key: 'home', label: 'Home', icon: 'house', path: paths.home },
  { key: 'inventory', label: 'Inventar', icon: 'stack', path: paths.inventory },
  { key: 'shopping', label: 'Einkauf', icon: 'cart', path: paths.shopping },
  { key: 'chats', label: 'Chats', icon: 'bubbles', path: paths.chats },
];

function normalizePathname(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

/** Index of the tab whose root path equals `pathname`, or -1 for pushed screens. */
export function tabIndexForPath(pathname: string): number {
  const normalized = normalizePathname(pathname);
  return TABS.findIndex((tab) => tab.path === normalized);
}

export function isTabPath(pathname: string): boolean {
  return tabIndexForPath(pathname) !== -1;
}

/** Query parameter carrying the post-login destination. */
export const REDIRECT_PARAM = 'redirect';

const AUTH_PAGES = new Set<string>([paths.login, paths.register, paths.forgotPassword]);

/**
 * Validates a post-login redirect target: only same-origin absolute paths are allowed
 * (prevents open redirects like `//evil.example` or `https://…`), auth pages fall back.
 */
export function safeRedirectTarget(raw: string | null | undefined, fallback: string = paths.home): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  if ([...raw].some((char) => char.charCodeAt(0) < 0x20 || char === '\u007f')) return fallback;
  let pathname: string;
  try {
    pathname = new URL(raw, 'https://homi.invalid').pathname;
  } catch {
    return fallback;
  }
  return AUTH_PAGES.has(normalizePathname(pathname)) ? fallback : raw;
}

/** `/login?redirect=<current path>` for the auth guard. */
export function loginPathWithRedirect(location: { pathname: string; search?: string; hash?: string }): string {
  const target = `${location.pathname}${location.search ?? ''}${location.hash ?? ''}`;
  if (target === paths.home || AUTH_PAGES.has(normalizePathname(location.pathname))) return paths.login;
  return `${paths.login}?${REDIRECT_PARAM}=${encodeURIComponent(target)}`;
}
