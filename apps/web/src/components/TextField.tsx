import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { cx } from './utils';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Visible label above the field (`footnote-medium` label-secondary), e.g. "Artikelname". */
  label: string;
  /** Error message under the field; also switches to the 1.5 px destructive ring. */
  error?: string | null;
  /** Helper text under the field (hidden while an error is shown). */
  hint?: ReactNode;
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
  /** Content after the input inside the field (e.g. a unit). */
  trailing?: ReactNode;
  /** Content before the input inside the field (e.g. "CHF" in `PriceField`). */
  leading?: ReactNode;
  /** Show the focused look permanently (gallery only). */
  forceFocused?: boolean;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Freegma "Text Input" (353 × 76): label at (4, 0); field 52 px, r 14, surface with a 1 px
 * separator ring; focused 1.5 px accent ring; error 1.5 px destructive ring + message at
 * (4, 82). Value/placeholder `body` at x 16, accent caret.
 */
export function TextField({
  label,
  error,
  hint,
  hideLabel = false,
  trailing,
  leading,
  forceFocused = false,
  id,
  className,
  disabled,
  ref,
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;
  const message = error || hint;
  return (
    <div
      className={cx('homi-field', className)}
      data-invalid={error ? '' : undefined}
      data-disabled={disabled || undefined}
    >
      <label htmlFor={inputId} className={cx('homi-field__label', hideLabel && 'visually-hidden')}>
        {label}
      </label>
      <div className="homi-field__control" data-focused={forceFocused || undefined}>
        {leading ? <span className="homi-field__leading">{leading}</span> : null}
        <input
          ref={ref}
          id={inputId}
          className="homi-field__input"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          {...rest}
        />
        {trailing ? <span className="homi-field__trailing">{trailing}</span> : null}
      </div>
      {message ? (
        <p
          id={messageId}
          className="homi-field__message"
          data-tone={error ? 'error' : 'hint'}
          role={error ? 'alert' : undefined}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
