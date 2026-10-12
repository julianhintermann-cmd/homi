// PLACEHOLDER – replaced by the households feature team
import { Button } from '@/components/Button';
import { LargeTitleHeader } from '@/components/LargeTitleHeader';
import { Screen } from '@/components/Screen';
import { useLogout, useMe } from '@/hooks/useAuth';

export function WelcomePage() {
  const { data: me } = useMe();
  const logout = useLogout();
  return (
    <Screen header={<LargeTitleHeader title={`Willkommen${me ? `, ${me.user.displayName}` : ''}`} />}>
      <p>Erstelle deinen ersten Haushalt oder nimm eine Einladung an.</p>
      <Button variant="secondary" loading={logout.isPending} onClick={() => logout.mutate()}>
        Abmelden
      </Button>
    </Screen>
  );
}
