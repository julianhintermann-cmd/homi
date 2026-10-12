// PLACEHOLDER – replaced by the households feature team
import { GlassButton } from '@/components/GlassButton';
import { LargeTitleHeader } from '@/components/LargeTitleHeader';
import { Screen } from '@/components/Screen';
import { useGoBack } from '@/routes/navigation';
import { paths } from '@/routes/paths';

export function MemberPage() {
  const goBack = useGoBack(paths.household);
  return (
    <Screen
      header={
        <LargeTitleHeader title="Mitglied" leading={<GlassButton icon="chevL" label="Zurück" onClick={goBack} />} />
      }
    >
      <p>Details zum Mitglied folgen.</p>
    </Screen>
  );
}
