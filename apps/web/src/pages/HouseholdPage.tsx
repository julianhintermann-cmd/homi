// PLACEHOLDER – replaced by the households feature team
import { GlassButton } from '@/components/GlassButton';
import { LargeTitleHeader } from '@/components/LargeTitleHeader';
import { Screen } from '@/components/Screen';
import { useActiveHousehold } from '@/hooks/useActiveHousehold';
import { useGoBack } from '@/routes/navigation';
import { paths } from '@/routes/paths';

export function HouseholdPage() {
  const goBack = useGoBack(paths.home);
  const { household } = useActiveHousehold();
  return (
    <Screen
      header={
        <LargeTitleHeader
          title={household?.name ?? 'Haushalt'}
          leading={<GlassButton icon="chevL" label="Zurück" onClick={goBack} />}
        />
      }
    >
      <p>Mitglieder und Einladungen folgen.</p>
    </Screen>
  );
}
