// PLACEHOLDER – replaced by a feature team
import { Link } from 'react-router';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { paths } from '@/routes/paths';

export function NotFoundPage() {
  return (
    <Screen>
      <EmptyState
        icon="search"
        title="Seite nicht gefunden"
        message="Diese Seite gibt es nicht (mehr)."
        action={<Link to={paths.home}>Zur Startseite</Link>}
      />
    </Screen>
  );
}
