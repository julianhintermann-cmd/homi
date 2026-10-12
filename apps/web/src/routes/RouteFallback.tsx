import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';

/** Neutral placeholder while a route chunk or the session loads (no spinner flash). */
export function RouteFallback() {
  return (
    <div className="route-fallback" aria-busy="true">
      <span className="visually-hidden" role="status">
        Wird geladen …
      </span>
    </div>
  );
}

export interface ConnectionProblemProps {
  /** `true`: device offline; `false`: server not reachable / unexpected error. */
  offline: boolean;
  onRetry: () => void;
  retrying?: boolean;
}

/** Full-screen offline state (e.g. app started from the home screen without network). */
export function ConnectionProblem({ offline, onRetry, retrying = false }: ConnectionProblemProps) {
  return (
    <div className="route-fallback">
      <EmptyState
        icon="wifi"
        title={offline ? 'Keine Verbindung' : 'Server nicht erreichbar'}
        message={
          offline
            ? 'Homi braucht eine Internetverbindung. Prüfe dein WLAN oder deine mobilen Daten.'
            : 'Homi ist gerade nicht erreichbar. Bitte versuche es in einem Moment erneut.'
        }
        action={
          <Button variant="secondary" onClick={onRetry} loading={retrying}>
            Erneut versuchen
          </Button>
        }
      />
    </div>
  );
}
