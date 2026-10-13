import { useId, useRef, useState, type FormEvent } from 'react';
import { ChangePasswordRequestSchema, PASSWORD_EQUALS_EMAIL_MESSAGE, passwordEqualsEmail } from '@homi/shared';
import { Button, HomiBottomSheet, SheetHeader, showToast } from '@/components';
import { firstInvalidField, mapSubmitError, validateFields, type FieldErrors } from '@/features/auth/formErrors';
import { PASSWORDS_DO_NOT_MATCH } from '@/features/auth/messages';
import { PasswordField } from '@/features/auth/PasswordField';
import { PasswordPolicyHints } from '@/features/auth/PasswordPolicyHints';
import { useChangePassword } from './hooks';
import '@/features/auth/auth.css';
import './account.css';

const FIELDS = ['currentPassword', 'newPassword', 'confirm'] as const;
type Field = (typeof FIELDS)[number];
type Values = Record<Field, string>;
const EMPTY: Values = { currentPassword: '', newPassword: '', confirm: '' };

export interface ChangePasswordSheetProps {
  open: boolean;
  /** The account's e-mail: username for password managers and the "not your e-mail" rule. */
  email: string;
  onClose: () => void;
}

/**
 * Page sheet "Passwort ändern": current password, new password (+ live policy checklist) and
 * confirmation. Dirty-guarded; on success the server keeps this session and signs out every other
 * device. Mount with a new `key` per opening (fresh, empty fields).
 */
export function ChangePasswordSheet({ open, email, onClose }: ChangePasswordSheetProps) {
  const change = useChangePassword();
  const hintsId = useId();
  const currentRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const refs = { currentPassword: currentRef, newPassword: newRef, confirm: confirmRef };
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const dirty = FIELDS.some((field) => values[field] !== '');

  const validate = (next: Values): FieldErrors<Field> => {
    const fieldErrors = validateFields<Field>(ChangePasswordRequestSchema, {
      currentPassword: next.currentPassword,
      newPassword: next.newPassword,
    });
    if (!fieldErrors.newPassword && passwordEqualsEmail(next.newPassword, email)) {
      fieldErrors.newPassword = PASSWORD_EQUALS_EMAIL_MESSAGE;
    }
    if (!fieldErrors.newPassword && next.confirm !== next.newPassword) fieldErrors.confirm = PASSWORDS_DO_NOT_MATCH;
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
    if (change.isPending) return;
    setSubmitted(true);
    setFormError(null);
    const fieldErrors = validate(values);
    setErrors(fieldErrors);
    const invalid = firstInvalidField(FIELDS, fieldErrors);
    if (invalid) {
      refs[invalid].current?.focus();
      return;
    }
    change.mutate(
      { currentPassword: values.currentPassword, newPassword: values.newPassword },
      {
        onSuccess: () => {
          showToast({ message: 'Passwort geändert', tone: 'success' });
          onClose();
        },
        onError: (error) => {
          const mapped = mapSubmitError(error, FIELDS, { WRONG_PASSWORD: 'currentPassword' });
          setErrors(mapped.fieldErrors);
          setFormError(mapped.formError);
          const field = firstInvalidField(FIELDS, mapped.fieldErrors);
          if (field) refs[field].current?.focus();
        },
      },
    );
  };

  return (
    <HomiBottomSheet open={open} dirty={dirty && !change.isPending} onClose={onClose} aria-label="Passwort ändern">
      <div className="account-sheet">
        <SheetHeader title="Passwort ändern" />
        <form className="account-sheet-form" noValidate onSubmit={onSubmit}>
          {/* Lets password managers attach the new password to the right account. */}
          <input
            type="email"
            name="username"
            autoComplete="username"
            value={email}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            className="visually-hidden"
          />
          <PasswordField
            ref={currentRef}
            label="Aktuelles Passwort"
            name="current-password"
            autoComplete="current-password"
            enterKeyHint="next"
            value={values.currentPassword}
            error={errors.currentPassword}
            onChange={(event) => update('currentPassword', event.target.value)}
          />
          <div className="auth-field-group">
            <PasswordField
              ref={newRef}
              label="Neues Passwort"
              name="new-password"
              autoComplete="new-password"
              enterKeyHint="next"
              value={values.newPassword}
              error={errors.newPassword}
              describedBy={hintsId}
              onChange={(event) => update('newPassword', event.target.value)}
            />
            <PasswordPolicyHints id={hintsId} password={values.newPassword} email={email} />
          </div>
          <PasswordField
            ref={confirmRef}
            label="Neues Passwort bestätigen"
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
          <p className="account-sheet-note">
            Du bleibst auf diesem Gerät angemeldet. Auf allen anderen Geräten wirst du abgemeldet.
          </p>
          <Button
            type="submit"
            fullWidth
            className="account-sheet-form__submit"
            loading={change.isPending}
            disabled={!dirty}
          >
            Passwort ändern
          </Button>
        </form>
      </div>
    </HomiBottomSheet>
  );
}
