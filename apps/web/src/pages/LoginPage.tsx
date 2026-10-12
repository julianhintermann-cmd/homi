// PLACEHOLDER – replaced by the auth feature team
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/Button';
import { LargeTitleHeader } from '@/components/LargeTitleHeader';
import { Screen } from '@/components/Screen';
import { useLogin } from '@/hooks/useAuth';
import { paths, REDIRECT_PARAM } from '@/routes/paths';

/** Minimal functional login; after success the `PublicOnly` guard continues to `?redirect=`. */
export function LoginPage() {
  const login = useLogin();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const redirect = searchParams.get(REDIRECT_PARAM);
  const registerHref = redirect
    ? `${paths.register}?${REDIRECT_PARAM}=${encodeURIComponent(redirect)}`
    : paths.register;

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <Screen header={<LargeTitleHeader title="Anmelden" />}>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 'var(--space-12)' }}>
        <label>
          E-Mail
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Passwort
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {login.error ? <p role="alert">{login.error.message}</p> : null}
        <Button type="submit" loading={login.isPending} fullWidth>
          Anmelden
        </Button>
      </form>
      <p>
        <Link to={registerHref}>Konto erstellen</Link> · <Link to={paths.forgotPassword}>Passwort vergessen?</Link>
      </p>
    </Screen>
  );
}
