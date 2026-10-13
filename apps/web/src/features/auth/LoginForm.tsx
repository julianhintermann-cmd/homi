import { useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { LoginRequestSchema } from '@homi/shared';
import { Button, TextField } from '@/components';
import { paths } from '@/routes/paths';
import { firstInvalidField, mapSubmitError, validateFields, type FieldErrors } from './formErrors';
import { PasswordField } from './PasswordField';
import { useRedirectTarget, withRedirect } from './redirect';
import { useLoginMutation } from './session';

const FIELDS = ['email', 'password'] as const;
type Field = (typeof FIELDS)[number];
type Values = Record<Field, string>;

/**
 * "Anmelden": e-mail + password (password-manager friendly autocomplete), Enter submits, inline
 * German errors. Wrong credentials stay generic ("E-Mail oder Passwort ist falsch."). On success
 * `useLoginMutation` stores the session and the `PublicOnly` guard continues to `?redirect=` or Home.
 */
export function LoginForm() {
  const login = useLoginMutation();
  // "Passwort vergessen?" keeps the destination (e.g. an invitation) for the way back to the login.
  const redirectTarget = useRedirectTarget();
  const headingId = useId();
  const [values, setValues] = useState<Values>({ email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const refs = { email: emailRef, password: passwordRef };

  const update = (field: Field, value: string): void => {
    const next = { ...values, [field]: value };
    setValues(next);
    setFormError(null);
    // After the first attempt, errors follow the input live (they disappear once fixed).
    if (submitted) setErrors(validateFields<Field>(LoginRequestSchema, next));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (login.isPending) return;
    setSubmitted(true);
    setFormError(null);
    const fieldErrors = validateFields<Field>(LoginRequestSchema, values);
    setErrors(fieldErrors);
    const invalid = firstInvalidField(FIELDS, fieldErrors);
    if (invalid) {
      refs[invalid].current?.focus();
      return;
    }
    login.mutate(values, {
      onError: (error) => {
        const mapped = mapSubmitError(error, FIELDS);
        setErrors(mapped.fieldErrors);
        setFormError(mapped.formError);
        const field = firstInvalidField(FIELDS, mapped.fieldErrors);
        if (field) refs[field].current?.focus();
      },
    });
  };

  return (
    <form className="auth-form" noValidate onSubmit={onSubmit} aria-labelledby={headingId}>
      <h2 id={headingId} className="visually-hidden">
        Anmelden
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
        enterKeyHint="next"
        placeholder="name@beispiel.ch"
        value={values.email}
        error={errors.email}
        onChange={(event) => update('email', event.target.value)}
        onKeyDown={(event) => {
          // "Weiter" on the keyboard: continue to the password instead of submitting half a form.
          if (event.key === 'Enter' && values.password === '') {
            event.preventDefault();
            passwordRef.current?.focus();
          }
        }}
      />
      <PasswordField
        ref={passwordRef}
        label="Passwort"
        name="password"
        autoComplete="current-password"
        enterKeyHint="go"
        placeholder="Dein Passwort"
        value={values.password}
        error={errors.password}
        onChange={(event) => update('password', event.target.value)}
      />
      <div className="auth-form__aside">
        <Link to={withRedirect(paths.forgotPassword, redirectTarget)} className="homi-text-button auth-link">
          Passwort vergessen?
        </Link>
      </div>
      {formError ? (
        <p className="homi-field__message auth-form__alert" data-tone="error" role="alert">
          {formError}
        </p>
      ) : null}
      <Button type="submit" fullWidth loading={login.isPending} className="auth-form__submit">
        Anmelden
      </Button>
    </form>
  );
}
