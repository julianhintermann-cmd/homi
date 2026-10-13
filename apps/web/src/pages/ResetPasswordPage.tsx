import { useParams } from 'react-router';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { ResetPasswordForm } from '@/features/auth/ResetPasswordForm';
import { useGoBack } from '@/routes/navigation';
import { paths } from '@/routes/paths';

/** `/passwort-zuruecksetzen/:token` – link from the reset e-mail; success continues to the login. */
export function ResetPasswordPage() {
  const { token = '' } = useParams();
  const goBack = useGoBack(paths.login);
  return (
    <AuthLayout title="Neues Passwort" subtitle="Wähle ein neues Passwort für dein Homi-Konto." onBack={goBack}>
      <ResetPasswordForm token={token} />
    </AuthLayout>
  );
}
