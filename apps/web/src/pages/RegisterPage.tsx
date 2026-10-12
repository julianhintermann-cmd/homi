// PLACEHOLDER – replaced by the auth feature team
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { PASSWORD_POLICY_HINT } from '@homi/shared';
import { Button } from '@/components/Button';
import { LargeTitleHeader } from '@/components/LargeTitleHeader';
import { Screen } from '@/components/Screen';
import { useRegister } from '@/hooks/useAuth';
import { paths } from '@/routes/paths';

/** Minimal functional registration; the `PublicOnly` guard redirects after success. */
export function RegisterPage() {
  const register = useRegister();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    register.mutate({ displayName, email, password });
  };

  return (
    <Screen header={<LargeTitleHeader title="Konto erstellen" />}>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 'var(--space-12)' }}>
        <label>
          Name
          <input autoComplete="name" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label>
          E-Mail
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Passwort
          <input
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <p>{PASSWORD_POLICY_HINT}</p>
        {register.error ? <p role="alert">{register.error.message}</p> : null}
        <Button type="submit" loading={register.isPending} fullWidth>
          Registrieren
        </Button>
      </form>
      <p>
        <Link to={paths.login}>Bereits ein Konto? Anmelden</Link>
      </p>
    </Screen>
  );
}
