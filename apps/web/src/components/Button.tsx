import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Icon, type IconName } from '@/icons/Icon';
import { cx, enableActiveStates } from './utils';

enableActiveStates();

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'plain';
export type ButtonSize = 'large' | 'medium';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * `primary` (label-colour capsule), `secondary` (`--color-fill-secondary`), `destructive`
   * (destructive-soft) or `plain` (accent text link button, e.g. "Zur Einkaufsliste hinzufügen").
   */
  variant?: ButtonVariant;
  /** `large`: 52 px capsule (forms, sheets). `medium`: 48 px pill, min. 200 px (empty states). */
  size?: ButtonSize;
  /** Stretch to the container width (the design's 353 px buttons inside the 20 px gutter). */
  fullWidth?: boolean;
  /** Shows a spinner, keeps the width and disables the button. */
  loading?: boolean;
  /** Leading icon (e.g. `cart` for the plain "Zur Einkaufsliste hinzufügen" link). */
  icon?: IconName;
  /** Shows the pressed look permanently (design review / gallery only). */
  forcePressed?: boolean;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Freegma "Button": 52 px capsule with a `headline` label. Pressed = layer opacity 0.82,
 * disabled = `#EAE9E4` / label-tertiary (FIDELITY §4.4).
 */
export function Button({
  variant = 'primary',
  size = 'large',
  fullWidth = false,
  loading = false,
  icon,
  forcePressed = false,
  type = 'button',
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const inactive = Boolean(disabled) || loading;
  return (
    <button
      type={type}
      disabled={inactive}
      aria-busy={loading || undefined}
      data-variant={variant}
      data-size={size}
      data-pressed={forcePressed || undefined}
      className={cx('homi-button', fullWidth && 'homi-button--full', className)}
      {...rest}
    >
      <span className="homi-button__content" data-hidden={loading || undefined}>
        {icon ? (
          <Icon name={icon} size={20} strokeWidth={variant === 'plain' ? 2.28 : 2.16} className="homi-button__icon" />
        ) : null}
        <span className="homi-button__label">{children}</span>
      </span>
      {loading ? (
        <span className="homi-button__spinner" role="status">
          <Spinner />
          <span className="visually-hidden">Wird geladen …</span>
        </span>
      ) : null}
    </button>
  );
}

/** Small activity indicator (rotating arc, transform-only animation). */
export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg className="homi-spinner" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.6" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
