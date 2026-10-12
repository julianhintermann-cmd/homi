// PLACEHOLDER – replaced by the auth feature team
import { Link } from 'react-router';
import { LargeTitleHeader } from '@/components/LargeTitleHeader';
import { Screen } from '@/components/Screen';
import { paths } from '@/routes/paths';

export function ForgotPasswordPage() {
  return (
    <Screen header={<LargeTitleHeader title="Passwort vergessen" />}>
      <p>Das Zurücksetzen per E-Mail folgt.</p>
      <Link to={paths.login}>Zurück zur Anmeldung</Link>
    </Screen>
  );
}
