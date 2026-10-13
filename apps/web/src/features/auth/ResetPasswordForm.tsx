import { useId, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { OpaqueTokenSchema, PasswordResetConfirmSchema } from '@homi/shared';
import { confirmPasswordReset } from '@/api/auth';
import { isApiError } from '@/api/client';
import { Button, EmptyState, showToast } from '@/components';
import { paths } from '@/routes/paths';
import { firstInvalidField, mapSubmitError, validateFields, type FieldErrors } from './formErrors';
import { LinkButton } from './LinkButton';
import { INVALID_RESET_LINK_MESSAGE, PASSWORDS_DO_NOT_MATCH } from './messages';
import { PasswordField } from './PasswordField';
import { PasswordPolicyHints } from './PasswordPolicyHints';
import { resetSessionAfterPasswordReset } from './session';

const FIELDS = ['password', 'confirm'] as const;
type Field = (typeof FIELDS)[number];

export interface ResetPasswordFormProps {
  /** Raw token from `/passwort-zuruecksetzen/:token`. */
  token: string;
}

/**
 * "Neues Passwort": new password (+ live policy checklist) and confirmation. The server revokes
 * every session of the account, so on success the local session data is dropped as well and the
 * user continues to the login. Invalid, used or expired links show a dedicated state with a way to
 * request a new one.
 */
export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const headingId = useId();
  const hintsId = useId();
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const refs = { password: passwordRef, confirm: confirmRef };
  const [values, setValues] = useState<Record<Field, string>>({ password: '', confirm: '' });
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [rejected, setRejected] = useState(false);
  const confirm = useMutation({ mutationFn: (password: string) => confirmPasswordReset({ token, password }) });

  const linkInvalid = rejected || !OpaqueTokenSchema.safeParse(token).success;
  if (linkInvalid) {
    return (
      <div className="auth-state">
        <EmptyState
          icon="xmark"
          title="Link ungültig"
          message={INVALID_RESET_LINK_MESSAGE}
          action={
            <LinkButton to={paths.forgotPassword} replace size="medium">
              Neuen Link anfordern
            </LinkButton>
          }
        />
      </div>
    );
  }

  const validate = (next: Record<Field, string>): FieldErrors<Field> => {
    const fieldErrors = validateFields<Field>(PasswordResetConfirmSchema, { token, password: next.password });
    if (!fieldErrors.password && next.confirm !== next.password) fieldErrors.confirm = PASSWORDS_DO_NOT_MATCH;
    return fieldErrors;
  };

  const update = (field: Field, value: string): void => {
    const next = { ...values, [field]: value };
    setValues(next);
    setFormError(null);
    if (submitted) setErrors(validate(next));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (confirm.isPending) return;
    setSubmitted(true);
    setFormError(null);
    const fieldErrors = validate(values);
    setErrors(fieldErrors);
    const invalid = firstInvalidField(FIELDS, fieldErrors);
    if (invalid) {
      refs[invalid].current?.focus();
      return;
    }
    confirm.mutate(values.password, {
      onSuccess: () => {
        // All sessions of the account were revoked server-side: drop local session state too.
        void resetSessionAfterPasswordReset(queryClient);
        showToast({ message: 'Passwort geändert', tone: 'success' });
        void navigate(paths.login, { replace: true });
      },
      onError: (error) => {
        if (isApiError(error) && error.code === 'INVALID_TOKEN') {
          setRejected(true);
          return;
        }
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
        Neues Passwort festlegen
      </h2>
      <div className="auth-field-group">
        <PasswordField
          ref={passwordRef}
          label="Neues Passwort"
          name="new-password"
          autoComplete="new-password"
          enterKeyHint="next"
          value={values.password}
          error={errors.password}
          describedBy={hintsId}
          onChange={(event) => update('password', event.target.value)}
        />
        <PasswordPolicyHints id={hintsId} password={values.password} />
      </div>
      <PasswordField
        ref={confirmRef}
        label="Passwort bestätigen"
        name="confirm-password"
        autoComplete="new-password"
        enterKeyHint="go"
        value={values.confirm}
        error={errors.confirm}
        onChange={(event) => update('confirm', event.target.value)}
      />
      {formError ? (
        <p className="homi-field__message auth-form__alert" data-tone="error" role="alert">
          {formError}
        </p>
      ) : null}
      <Button type="submit" fullWidth loading={confirm.isPending} className="auth-form__submit">
        Passwort speichern
      </Button>
    </form>
  );
}
