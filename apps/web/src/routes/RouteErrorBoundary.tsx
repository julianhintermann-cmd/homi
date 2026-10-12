import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';

/** A lazy route chunk could not be loaded – usually a new deployment replaced the old files. */
function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to fetch/i.test(
    error.message,
  );
}

function ErrorScreen({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const chunk = isChunkLoadError(error);
  return (
    <div className="route-fallback" role="alert">
      <EmptyState
        icon={chunk ? 'wifi' : 'xmark'}
        title={chunk ? 'Seite konnte nicht geladen werden' : 'Etwas ist schiefgelaufen'}
        message={
          chunk
            ? 'Möglicherweise gibt es eine neue Version von Homi oder die Verbindung ist unterbrochen.'
            : 'Bitte versuche es erneut. Wenn das Problem bleibt, lade die App neu.'
        }
        action={
          <div style={{ display: 'flex', gap: 'var(--space-12)', flexWrap: 'wrap', justifyContent: 'center' }}>
            {onRetry && !chunk ? (
              <Button variant="secondary" onClick={onRetry}>
                Erneut versuchen
              </Button>
            ) : null}
            <Button onClick={() => window.location.reload()}>Neu laden</Button>
          </div>
        }
      />
    </div>
  );
}

/** `errorElement` of the root data route (last line of defence). */
export function RootRouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <ErrorScreen error={new Error('Not found')} />;
  }
  return <ErrorScreen error={error} />;
}

interface ScreenErrorBoundaryProps {
  children: ReactNode;
  /** Changing the key (e.g. pathname) resets the boundary. */
  resetKey?: string;
}

interface ScreenErrorBoundaryState {
  error: unknown;
  resetKey: string | undefined;
}

/**
 * Per-screen error boundary: a crashing screen does not take down the tab bar, other
 * stacked screens or open sheets.
 */
export class ScreenErrorBoundary extends Component<ScreenErrorBoundaryProps, ScreenErrorBoundaryState> {
  override state: ScreenErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<ScreenErrorBoundaryState> {
    return { error: error ?? new Error('Unknown error') };
  }

  static getDerivedStateFromProps(
    props: ScreenErrorBoundaryProps,
    state: ScreenErrorBoundaryState,
  ): Partial<ScreenErrorBoundaryState> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[Homi] Screen crashed', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return <ErrorScreen error={this.state.error} onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}
