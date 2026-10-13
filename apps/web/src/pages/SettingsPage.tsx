import { InlineHeader, Screen } from '@/components';
import { SettingsView } from '@/features/account/SettingsView';
import { useGoBack } from '@/routes/navigation';
import { paths } from '@/routes/paths';

/** `/einstellungen` – pushed screen (no tab bar), reached from Haushalt (09) and Profil. */
export function SettingsPage() {
  const goBack = useGoBack(paths.household);
  return (
    <Screen header={<InlineHeader title="Einstellungen" onBack={goBack} />}>
      <SettingsView />
    </Screen>
  );
}
