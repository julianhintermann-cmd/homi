// PLACEHOLDER – replaced by the home feature team
import { LargeTitleHeader } from '@/components/LargeTitleHeader';
import { Screen } from '@/components/Screen';
import { useActiveHousehold } from '@/hooks/useActiveHousehold';

export function HomePage() {
  const { household } = useActiveHousehold();
  return (
    <Screen withTabBar header={<LargeTitleHeader title="Home" subtitle={household?.name} />}>
      <p>Übersicht über Inventar, Einkaufsliste und Aktivitäten folgt.</p>
    </Screen>
  );
}
