import { Navigate, Outlet, useSearchParams } from 'react-router';
import { useMe, useSessionUiStore } from '@/hooks/useAuth';
import { useRealLocation } from './navigation';
import { loginPathWithRedirect, paths, REDIRECT_PARAM, safeRedirectTarget } from './paths';
import { ConnectionProblem, RouteFallback } from './RouteFallback';
import { deriveSessionStatus } from './session';

/**
 * Renders child routes only for an authenticated session; otherwise redirects to
 * `/login?redirect=<current URL>`. While the session is unknown a neutral fallback shows;
 * if `/auth/me` cannot be reached (offline cold start) a retry screen replaces the
 * misleading login redirect.
 */
export function RequireAuth() {
  const me = useMe();
  const location = useRealLocation();
  const explicitLogout = useSessionUiStore((s) => s.explicitLogout);
  const status = deriveSessionStatus(me);

  switch (status.kind) {
    case 'loading':
      return <RouteFallback />;
    case 'unreachable':
      return <ConnectionProblem offline={status.offline} retrying={me.isFetching} onRetry={() => void me.refetch()} />;
    case 'anonymous':
      return <Navigate to={explicitLogout ? paths.login : loginPathWithRedirect(location)} replace />;
    case 'authenticated':
      return <Outlet />;
  }
}

/** Below `RequireAuth`: users without any household go to onboarding (`/willkommen`). */
export function RequireHousehold() {
  const { data: me } = useMe();
  if (!me) return <RouteFallback />;
  if (me.households.length === 0) return <Navigate to={paths.welcome} replace />;
  return <Outlet />;
}

/** Login/registration/password-forgotten: logged-in users continue to `?redirect=` or Home. */
export function PublicOnly() {
  const me = useMe();
  const [searchParams] = useSearchParams();
  const status = deriveSessionStatus(me);

  if (status.kind === 'loading') return <RouteFallback />;
  if (status.kind === 'authenticated') {
    return <Navigate to={safeRedirectTarget(searchParams.get(REDIRECT_PARAM))} replace />;
  }
  // Logged out – or session unknown because offline: the public page can still be shown.
  return <Outlet />;
}
