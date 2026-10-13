import { AuthLayout } from '@/features/auth/AuthLayout';
import { ForgotPasswordForm } from '@/features/auth/ForgotPasswordForm';
import { useRedirectTarget, withRedirect } from '@/features/auth/redirect';
import { useGoBack } from '@/routes/navigation';
import { paths } from '@/routes/paths';

/** `/passwort-vergessen` – public; requests a reset link (neutral confirmation, no account enumeration). */
export function ForgotPasswordPage() {
  const goBack = useGoBack(withRedirect(paths.login, useRedirectTarget()));
  return (
    <AuthLayout
      title="Passwort vergessen"
      subtitle="Wir senden dir einen Link, mit dem du ein neues Passwort festlegen kannst."
      onBack={goBack}
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
