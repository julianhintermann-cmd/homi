import { AuthLayout } from '@/features/auth/AuthLayout';
import { LinkButton } from '@/features/auth/LinkButton';
import { LoginForm } from '@/features/auth/LoginForm';
import { useRedirectTarget, withRedirect } from '@/features/auth/redirect';
import { paths } from '@/routes/paths';

/** `/login` – public; signed-in users are forwarded by the `PublicOnly` guard (honours `?redirect=`). */
export function LoginPage() {
  const redirect = useRedirectTarget();
  return (
    <AuthLayout
      title="Willkommen zurück"
      subtitle="Melde dich an, um deinen Haushalt zu organisieren."
      footer={
        <>
          <p className="auth-footer__text">Neu bei Homi?</p>
          <LinkButton to={withRedirect(paths.register, redirect)} variant="secondary" fullWidth>
            Konto erstellen
          </LinkButton>
        </>
      }
    >
      <LoginForm />
    </AuthLayout>
  );
}
