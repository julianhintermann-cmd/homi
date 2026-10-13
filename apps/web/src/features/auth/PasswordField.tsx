import { useId, useState } from 'react';
import { TextField, type TextFieldProps } from '@/components';

export interface PasswordFieldProps extends Omit<TextFieldProps, 'type' | 'trailing' | 'aria-describedby'> {
  /** Extra element ids describing the field (e.g. the policy checklist), kept next to the field message. */
  describedBy?: string;
}

/**
 * `TextField` for passwords with a "Anzeigen / Ausblenden" text toggle (accent, like the design's
 * inline text actions). The toggle keeps the keyboard open (no focus steal) and is ≥ 44 px tall.
 */
export function PasswordField({ label, disabled, id, describedBy, error, hint, ...rest }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const autoId = useId();
  const inputId = id ?? autoId;
  // TextField renders its message (error or hint) as `${id}-message`.
  const ariaDescribedBy =
    [error || hint ? `${inputId}-message` : null, describedBy ?? null].filter(Boolean).join(' ') || undefined;

  return (
    <TextField
      {...rest}
      id={inputId}
      label={label}
      error={error}
      hint={hint}
      disabled={disabled}
      aria-describedby={ariaDescribedBy}
      type={visible ? 'text' : 'password'}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        <button
          type="button"
          className="homi-text-button auth-password-toggle"
          aria-label={`${label} ${visible ? 'ausblenden' : 'anzeigen'}`}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? 'Ausblenden' : 'Anzeigen'}
        </button>
      }
    />
  );
}
