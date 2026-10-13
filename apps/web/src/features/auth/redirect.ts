import { useSearchParams } from 'react-router';
import { REDIRECT_PARAM, safeRedirectTarget } from '@/routes/paths';

/**
 * Post-login destination handling (`?redirect=`). The `PublicOnly` guard performs the actual
 * redirect after login/registration; these helpers only carry a **validated** target between the
 * public pages (Anmelden ⇄ Registrieren), e.g. back to `/einladung/<token>`.
 */

/** The `?redirect=` target if it is a safe same-origin app path, otherwise `null`. */
export function validRedirectTarget(raw: string | null | undefined): string | null {
  const target = safeRedirectTarget(raw, '');
  return target === '' ? null : target;
}

export function useRedirectTarget(): string | null {
  const [searchParams] = useSearchParams();
  return validRedirectTarget(searchParams.get(REDIRECT_PARAM));
}

/** `path?redirect=<target>` (unchanged `path` without a valid target). */
export function withRedirect(path: string, target: string | null): string {
  const safe = validRedirectTarget(target);
  return safe ? `${path}?${REDIRECT_PARAM}=${encodeURIComponent(safe)}` : path;
}
