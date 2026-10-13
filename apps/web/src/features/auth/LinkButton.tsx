import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { ButtonSize, ButtonVariant } from '@/components';

export interface LinkButtonProps {
  to: string;
  children: ReactNode;
  variant?: Exclude<ButtonVariant, 'plain'>;
  size?: ButtonSize;
  fullWidth?: boolean;
  replace?: boolean;
  className?: string;
}

/**
 * Navigation styled as the design-system `Button` (same `homi-button` classes and states) – for
 * actions that are links ("Konto erstellen", "Zur Anmeldung", "Zur Startseite").
 */
export function LinkButton({
  to,
  children,
  variant = 'primary',
  size = 'large',
  fullWidth = false,
  replace,
  className,
}: LinkButtonProps) {
  const classes = ['homi-button', fullWidth ? 'homi-button--full' : null, className].filter(Boolean).join(' ');
  return (
    <Link to={to} replace={replace} className={classes} data-variant={variant} data-size={size}>
      <span className="homi-button__content">
        <span className="homi-button__label">{children}</span>
      </span>
    </Link>
  );
}
