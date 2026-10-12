// PLACEHOLDER – replaced by the auth feature team
import { Link } from 'react-router';
import { LargeTitleHeader } from '@/components/LargeTitleHeader';
import { Screen } from '@/components/Screen';
import { paths } from '@/routes/paths';

export function ResetPasswordPage() {
  return (
    <Screen header={<LargeTitleHeader title="Neues Passwort" />}>
      <p>Das Setzen eines neuen Passworts folgt.</p>
      <Link to={paths.login}>Zur Anmeldung</Link>
    </Screen>
  );
}
