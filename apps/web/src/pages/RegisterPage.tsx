import { Link } from 'react-router';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { useRedirectTarget, withRedirect } from '@/features/auth/redirect';
import { RegisterForm } from '@/features/auth/RegisterForm';
import { useGoBack } from '@/routes/navigation';
import { paths } from '@/routes/paths';

/** `/registrieren` – public; after success the `PublicOnly` guard continues (`?redirect=` → `/willkommen` → Home). */
export function RegisterPage() {
  const redirect = useRedirectTarget();
  const loginHref = withRedirect(paths.login, redirect);
  const goBack = useGoBack(loginHref);
  return (
    <AuthLayout
      title="Konto erstellen"
      subtitle="Inventar, Einkaufsliste und Chat – gemeinsam mit deinem Haushalt."
      onBack={goBack}
      footer={
        <p className="auth-footer__text">
          Bereits ein Konto?{' '}
          <Link to={loginHref} replace className="homi-text-button auth-link">
            Anmelden
          </Link>
        </p>
      }
    >
      <RegisterForm />
    </AuthLayout>
  );
}
