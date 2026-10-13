import { useId, useRef, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { PasswordResetRequestSchema } from '@homi/shared';
import { requestPasswordReset } from '@/api/auth';
import { Button, Card, EmptyState, Skeleton, TextField } from '@/components';
import { useAuthConfig } from '@/hooks/useAuth';
import { paths } from '@/routes/paths';
import { mapSubmitError, validateFields, type FieldErrors } from './formErrors';
import { LinkButton } from './LinkButton';
import { useRedirectTarget, withRedirect } from './redirect';
import { RESET_DISABLED_MESSAGE, RESET_REQUESTED_MESSAGE } from './messages';

type Field = 'email';

/**
 * "Passwort vergessen": asks for the e-mail address and always ends in the same neutral
 * confirmation. When the server has no mail delivery (`passwordResetEnabled: false`) a clear note
 * replaces the form.
 */
export function ForgotPasswordForm() {
  const config = useAuthConfig();
  // Back to the login with the original destination (e.g. `/einladung/<token>`).
  const loginPath = withRedirect(paths.login, useRedirectTarget());
  const headingId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const request = useMutation({ mutationFn: (value: string) => requestPasswordReset({ email: value }) });

  if (config.isPending) {
    return (
      <div className="auth-form" aria-busy="true">
        <span className="visually-hidden" role="status">
          Wird geladen …
        </span>
        <Skeleton height={76} radius="var(--radius-md)" />
        <Skeleton height={52} radius="var(--radius-xl)" />
      </div>
    );
  }

  if (config.data?.passwordResetEnabled === false) {
    return (
      <div className="auth-form">
        <Card padded radius="small" role="note">
          <p className="auth-note">{RESET_DISABLED_MESSAGE}</p>
        </Card>
        <LinkButton to={loginPath} replace fullWidth>
          Zurück zur Anmeldung
        </LinkButton>
      </div>
    );
  }

  if (request.isSuccess) {
    return (
      <div className="auth-state">
        <EmptyState
          icon="checkCircle"
          title="Schau in dein Postfach"
          message={RESET_REQUESTED_MESSAGE}
          action={
            <LinkButton to={loginPath} replace size="medium">
              Zur Anmeldung
            </LinkButton>
          }
        />
      </div>
    );
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (request.isPending) return;
    setSubmitted(true);
    setFormError(null);
    const fieldErrors = validateFields<Field>(PasswordResetRequestSchema, { email });
    setErrors(fieldErrors);
    if (fieldErrors.email) {
      emailRef.current?.focus();
      return;
    }
    request.mutate(email, {
      onError: (error) => {
        const mapped = mapSubmitError(error, ['email'] as const);
        setErrors(mapped.fieldErrors);
        setFormError(mapped.formError);
      },
    });
  };

  return (
    <form className="auth-form" noValidate onSubmit={onSubmit} aria-labelledby={headingId}>
      <h2 id={headingId} className="visually-hidden">
        Link zum Zurücksetzen anfordern
      </h2>
      <TextField
        ref={emailRef}
        label="E-Mail"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="send"
        placeholder="name@beispiel.ch"
        value={email}
        error={errors.email}
        onChange={(event) => {
          setEmail(event.target.value);
          setFormError(null);
          if (submitted) setErrors(validateFields<Field>(PasswordResetRequestSchema, { email: event.target.value }));
        }}
      />
      {formError ? (
        <p className="homi-field__message auth-form__alert" data-tone="error" role="alert">
          {formError}
        </p>
      ) : null}
      <Button type="submit" fullWidth loading={request.isPending} className="auth-form__submit">
        Link senden
      </Button>
    </form>
  );
}
