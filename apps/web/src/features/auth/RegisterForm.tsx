import { useId, useRef, useState, type FormEvent } from 'react';
import { LIMITS, PASSWORD_EQUALS_EMAIL_MESSAGE, passwordEqualsEmail, RegisterRequestSchema } from '@homi/shared';
import { Button, TextField } from '@/components';
import { firstInvalidField, mapSubmitError, validateFields, type FieldErrors } from './formErrors';
import { PasswordField } from './PasswordField';
import { PasswordPolicyHints } from './PasswordPolicyHints';
import { useRegisterMutation } from './session';

const FIELDS = ['displayName', 'email', 'password'] as const;
type Field = (typeof FIELDS)[number];
type Values = Record<Field, string>;

function validate(values: Values): FieldErrors<Field> {
  const errors = validateFields<Field>(RegisterRequestSchema, values);
  // The schema checks this rule only once every field is valid – show it right away instead.
  if (!errors.password && values.password && passwordEqualsEmail(values.password, values.email)) {
    errors.password = PASSWORD_EQUALS_EMAIL_MESSAGE;
  }
  return errors;
}

/**
 * "Konto erstellen": Anzeigename, E-Mail, Passwort with the live policy checklist. Validation
 * uses the shared `RegisterRequestSchema` (same rules and messages as the server); "E-Mail schon
 * vergeben" lands on the e-mail field. After success the `PublicOnly` guard continues to
 * `?redirect=`, `/willkommen` (no household yet) or Home.
 */
export function RegisterForm() {
  const register = useRegisterMutation();
  const headingId = useId();
  const hintsId = useId();
  const [values, setValues] = useState<Values>({ displayName: '', email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const displayNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const refs = { displayName: displayNameRef, email: emailRef, password: passwordRef };

  const update = (field: Field, value: string): void => {
    const next = { ...values, [field]: value };
    setValues(next);
    setFormError(null);
    if (submitted) setErrors(validate(next));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (register.isPending) return;
    setSubmitted(true);
    setFormError(null);
    const fieldErrors = validate(values);
    setErrors(fieldErrors);
    const invalid = firstInvalidField(FIELDS, fieldErrors);
    if (invalid) {
      refs[invalid].current?.focus();
      return;
    }
    register.mutate(values, {
      onError: (error) => {
        const mapped = mapSubmitError(error, FIELDS, { EMAIL_TAKEN: 'email' });
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
        Registrieren
      </h2>
      <TextField
        ref={displayNameRef}
        label="Anzeigename"
        name="name"
        autoComplete="name"
        autoCapitalize="words"
        enterKeyHint="next"
        placeholder="z. B. Julia"
        maxLength={LIMITS.displayName.max}
        hint="So sehen dich die anderen in deinem Haushalt."
        value={values.displayName}
        error={errors.displayName}
        onChange={(event) => update('displayName', event.target.value)}
      />
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
        maxLength={LIMITS.email.max}
        value={values.email}
        error={errors.email}
        onChange={(event) => update('email', event.target.value)}
      />
      <div className="auth-field-group">
        <PasswordField
          ref={passwordRef}
          label="Passwort"
          name="new-password"
          autoComplete="new-password"
          enterKeyHint="go"
          placeholder={`Mindestens ${LIMITS.password.min} Zeichen`}
          maxLength={LIMITS.password.max}
          value={values.password}
          error={errors.password}
          describedBy={hintsId}
          onChange={(event) => update('password', event.target.value)}
        />
        <PasswordPolicyHints id={hintsId} password={values.password} email={values.email} />
      </div>
      {formError ? (
        <p className="homi-field__message auth-form__alert" data-tone="error" role="alert">
          {formError}
        </p>
      ) : null}
      <Button type="submit" fullWidth loading={register.isPending} className="auth-form__submit">
        Registrieren
      </Button>
    </form>
  );
}
