import { EmptyState, Screen } from '@/components';
import { LinkButton } from '@/features/auth/LinkButton';
import { paths } from '@/routes/paths';

/**
 * Fallback for unknown URLs (signed in or not): friendly empty state with the way back Home. The
 * empty-state title is the screen's `h1` (heading navigation).
 */
export function NotFoundPage() {
  return (
    <Screen aria-label="Seite nicht gefunden">
      <EmptyState
        fill
        icon="search"
        titleAs="h1"
        title="Seite nicht gefunden"
        message="Diese Seite gibt es nicht (mehr). Vielleicht war der Link unvollständig."
        action={
          <LinkButton to={paths.home} replace size="medium">
            Zur Startseite
          </LinkButton>
        }
      />
    </Screen>
  );
}
