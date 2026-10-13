import { InlineHeader, Screen } from '@/components';
import { ProfileView } from '@/features/account/ProfileView';
import { useGoBack } from '@/routes/navigation';
import { paths } from '@/routes/paths';

/** `/profil` – pushed screen (no tab bar), reached from Haushalt (09) and Einstellungen. */
export function ProfilePage() {
  const goBack = useGoBack(paths.household);
  return (
    <Screen header={<InlineHeader title="Profil" onBack={goBack} />}>
      <ProfileView />
    </Screen>
  );
}
