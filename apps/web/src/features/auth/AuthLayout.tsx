import { useId, type ReactNode } from 'react';
import { GlassButton, LargeTitleHeader, Screen } from '@/components';
import './auth.css';

export interface AuthLayoutProps {
  /** Large title, e.g. "Willkommen zurück". */
  title: string;
  /** `subhead` label-secondary line under the title. */
  subtitle?: ReactNode;
  /** Shows the glass back button (chevL) in the floating toolbar row. */
  onBack?: () => void;
  backLabel?: string;
  children: ReactNode;
  /** Pinned to the bottom of the screen (e.g. "Konto erstellen"), above the home indicator. */
  footer?: ReactNode;
}

/**
 * Scaffold of the public auth screens (not in the Freegma file – built as an extension of the
 * design language): large-title header like 02/03 (glass back button at (16, safe + 4), title at
 * safe + 52), 20 px gutter, form content 28 px below the subtitle and an optional footer whose last
 * button ends 8 px above the home indicator (like the primary button of sheet 06).
 */
export function AuthLayout({ title, subtitle, onBack, backLabel = 'Zurück', children, footer }: AuthLayoutProps) {
  const titleId = useId();
  return (
    <Screen
      className="auth-screen"
      aria-labelledby={titleId}
      header={
        <LargeTitleHeader
          title={title}
          subtitle={subtitle}
          titleId={titleId}
          leading={onBack ? <GlassButton icon="chevL" label={backLabel} onClick={onBack} /> : undefined}
        />
      }
    >
      <div className="auth-body">
        {children}
        {footer ? <div className="auth-footer">{footer}</div> : null}
      </div>
    </Screen>
  );
}
