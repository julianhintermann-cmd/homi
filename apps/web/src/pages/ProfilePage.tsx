// PLACEHOLDER – replaced by the account feature team
import { Button } from '@/components/Button';
import { GlassButton } from '@/components/GlassButton';
import { LargeTitleHeader } from '@/components/LargeTitleHeader';
import { Screen } from '@/components/Screen';
import { useLogout, useMe } from '@/hooks/useAuth';
import { useGoBack } from '@/routes/navigation';
import { paths } from '@/routes/paths';

export function ProfilePage() {
  const goBack = useGoBack(paths.home);
  const { data: me } = useMe();
  const logout = useLogout();
  return (
    <Screen
      header={
        <LargeTitleHeader
          title={me?.user.displayName ?? 'Profil'}
          subtitle={me?.user.email}
          leading={<GlassButton icon="chevL" label="Zurück" onClick={goBack} />}
        />
      }
    >
      <Button variant="destructive" loading={logout.isPending} onClick={() => logout.mutate()}>
        Abmelden
      </Button>
      {logout.error ? <p role="alert">{logout.error.message}</p> : null}
    </Screen>
  );
}
