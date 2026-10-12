import type { MouseEventHandler, ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon } from '@/icons/Icon';
import { GlassButton } from './GlassButton';
import { cx, enableActiveStates } from './utils';

enableActiveStates();

export interface InlineHeaderContact {
  name: string;
  /** Avatar node (design: `Avatar` 48 px, initial 19 / 600). */
  avatar: ReactNode;
  /** The name pill opens the member/household details. */
  to?: string;
  onPress?: MouseEventHandler<HTMLElement>;
  /** Accessible label of the pill. Default "Details zu {name}". */
  label?: string;
}

export interface InlineHeaderProps {
  /** Centred `headline` title (03b, 09). Ignored in the contact (chat) variant. */
  title?: string;
  /** `caption` label-secondary line under the title (Navigation Header component). */
  subtitle?: string;
  /** Renders the glass back button (chevL) calling this handler. */
  onBack?: () => void;
  /** Accessible label of the back button. Default "Zurück". */
  backLabel?: string;
  /** Replaces the back button. */
  leading?: ReactNode;
  /** Trailing glass controls (e.g. `GlassToolbar`), right-aligned to the 20 px gutter. */
  trailing?: ReactNode;
  /** Chat header: avatar 48 px at safe-top − 4 and a glass name pill at safe-top + 48. */
  contact?: InlineHeaderContact;
  titleId?: string;
  className?: string;
}

/**
 * Inline navigation header (Freegma "Navigation Header", screens 03b / 08* / 09): glass back
 * button at (16, safe + 4), centred title, optional trailing toolbar. The bar floats over the
 * content with a background-colour scroll edge behind it.
 */
export function InlineHeader({
  title,
  subtitle,
  onBack,
  backLabel = 'Zurück',
  leading,
  trailing,
  contact,
  titleId,
  className,
}: InlineHeaderProps) {
  const lead = leading ?? (onBack ? <GlassButton icon="chevL" label={backLabel} onClick={onBack} /> : null);

  if (contact) {
    const pillLabel = contact.label ?? `Details zu ${contact.name}`;
    const pillContent = (
      <>
        <span className="homi-contact-pill__name">{contact.name}</span>
        <Icon name="chevR" size={13} strokeWidth={4.06} className="homi-contact-pill__chevron" />
      </>
    );
    return (
      <header className={cx('homi-inline-header homi-inline-header--contact', className)}>
        <div className="homi-scroll-edge" data-position="top" data-variant="chat" aria-hidden="true" />
        <div className="homi-nav-bar homi-nav-bar--inline">
          <div className="homi-nav-bar__leading">{lead}</div>
          <div className="homi-nav-bar__trailing">{trailing}</div>
        </div>
        <div className="homi-contact-header">
          <h1 id={titleId} className="visually-hidden">
            {contact.name}
          </h1>
          <span className="homi-contact-header__avatar">{contact.avatar}</span>
          {contact.to !== undefined ? (
            <Link
              to={contact.to}
              className="glass glass--pressable homi-contact-pill"
              aria-label={pillLabel}
              onClick={contact.onPress}
            >
              {pillContent}
            </Link>
          ) : contact.onPress ? (
            <button
              type="button"
              className="glass glass--pressable homi-contact-pill"
              aria-label={pillLabel}
              onClick={contact.onPress}
            >
              {pillContent}
            </button>
          ) : (
            <span className="glass homi-contact-pill">{pillContent}</span>
          )}
        </div>
      </header>
    );
  }

  return (
    <header className={cx('homi-inline-header', className)} data-subtitle={subtitle ? '' : undefined}>
      <div className="homi-scroll-edge" data-position="top" data-variant="inline" aria-hidden="true" />
      <div className="homi-nav-bar homi-nav-bar--inline">
        <div className="homi-nav-bar__leading">{lead}</div>
        <div className="homi-nav-bar__center">
          {title ? (
            <h1 id={titleId} className="homi-nav-bar__title">
              {title}
            </h1>
          ) : null}
          {subtitle ? <p className="homi-nav-bar__subtitle">{subtitle}</p> : null}
        </div>
        <div className="homi-nav-bar__trailing">{trailing}</div>
      </div>
      <div className="homi-nav-bar__spacer" aria-hidden="true" />
    </header>
  );
}
