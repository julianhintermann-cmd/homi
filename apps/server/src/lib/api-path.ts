/**
 * "Is this an `/api` request?" – decided in one place for the CSRF hook and the session hook
 * (ARCHITECTURE §4.3).
 *
 * The router (find-my-way) matches the percent-decoded path, so a prefix test on the raw URL alone
 * can be bypassed: `POST /%61pi/auth/logout` reached the logout route while both hooks treated it as
 * a non-API request (no CSRF check, no session). A request therefore targets the API when its raw
 * path, its decoded path or the route it matched starts with `/api`; it is *canonical* only when the
 * raw path itself does. Non-canonical API requests are rejected by the CSRF hook (fail closed).
 */

export const API_PREFIX = '/api';

/** `'none'` – not an API request; `'canonical'` – raw path starts with `/api`; `'non-canonical'` – an encoded spelling of it. */
export type ApiTarget = 'none' | 'canonical' | 'non-canonical';

export function hasApiPrefix(path: string): boolean {
  return path === API_PREFIX || path.startsWith(`${API_PREFIX}/`);
}

/** The path part of a request target (`/api/x?y=1` → `/api/x`). */
function pathOf(url: string): string {
  const end = url.search(/[?#]/);
  return end === -1 ? url : url.slice(0, end);
}

function decodePath(path: string): string | null {
  try {
    return decodeURIComponent(path);
  } catch {
    // The router cannot decode it either (→ 400), so no API handler can be reached through it.
    return null;
  }
}

/**
 * @param url       raw request target (`request.url`)
 * @param routeUrl  pattern of the matched route (`request.routeOptions.url`), if any
 */
export function classifyApiTarget(url: string, routeUrl?: string): ApiTarget {
  const raw = pathOf(url);
  if (hasApiPrefix(raw)) return 'canonical';
  if (routeUrl !== undefined && hasApiPrefix(routeUrl)) return 'non-canonical';
  const decoded = decodePath(raw);
  return decoded !== null && hasApiPrefix(decoded) ? 'non-canonical' : 'none';
}
