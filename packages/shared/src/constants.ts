/**
 * Cross-cutting constants shared by the server and the web client.
 * Everything here is part of the API contract (docs/ARCHITECTURE.md).
 */

/** Prefix of every REST route. */
export const API_PREFIX = '/api';

/** Socket.IO endpoint path (same origin). */
export const SOCKET_PATH = '/socket.io';

/** Name of the HttpOnly session cookie. */
export const SESSION_COOKIE_NAME = 'homi_session';

/** Header that must accompany every mutating `/api` request (CSRF defence, §4.3). */
export const CSRF_HEADER_NAME = 'X-Homi-Request';
export const CSRF_HEADER_VALUE = '1';

/** Sliding session refresh happens at most this often. */
export const SESSION_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

/** Frontend paths that the server builds links to (German routes, §7). */
export const INVITATION_PATH_PREFIX = '/einladung/';
export const PASSWORD_RESET_PATH_PREFIX = '/passwort-zuruecksetzen/';

/** Default name of the household shopping list created with every household. */
export const DEFAULT_SHOPPING_LIST_NAME = 'Einkaufsliste';

/** Lifetime of a password-reset token. */
export const PASSWORD_RESET_TOKEN_TTL_MINUTES = 60;

/** Input and paging limits. Database column sizes are the hard upper bound. */
export const LIMITS = {
  displayName: { min: 1, max: 60 },
  email: { max: 254 },
  password: { min: 10, max: 128 },
  householdName: { min: 1, max: 60 },
  itemName: { min: 1, max: 80 },
  shoppingItemName: { min: 1, max: 80 },
  searchQuery: { max: 80 },
  /** quantity: Decimal(12,3) column; product quantity × unitPrice must fit Decimal(12,2). */
  quantity: { max: '99999.999', scale: 3 },
  /** unit price in CHF: Decimal(10,2) column. */
  unitPrice: { max: '99999.99', scale: 2 },
  money: { scale: 2 },
  messageContent: { min: 1, max: 4000 },
  messageClientId: { min: 8, max: 64 },
  invitationExpiresInDays: { min: 1, max: 30, default: 7 },
  itemsPage: { default: 50, max: 100 },
  messagesPage: { default: 50, max: 100 },
  dashboard: { recentItems: 3, openShoppingItems: 3, recentActivity: 5, weeklyWindowDays: 7 },
  upload: { defaultMaxMb: 15, maxMegapixels: 40, thumbSize: 240, fullMaxSize: 1600 },
  chat: { sendMax: 20, sendWindowMs: 10_000, typingMinIntervalMs: 1_000 },
} as const;
