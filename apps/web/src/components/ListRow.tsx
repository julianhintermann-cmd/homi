import type { MouseEventHandler, ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon, type IconName } from '@/icons/Icon';
import { cx, enableActiveStates } from './utils';

enableActiveStates();

/**
 * - `settings`: 52 px, 30 px icon tile (r 8, surface-muted) – Freegma "Settings Row"
 * - `member`: 60 px, 36 px avatar + name/role – Freegma "Household Member Row"
 * - `action`: 52 px, 32 px accent-soft circle + accent label (invite row in 09)
 * - `plain`: 52 px, text only
 */
export type ListRowVariant = 'settings' | 'member' | 'action' | 'plain';

export interface ListRowProps {
  title: ReactNode;
  /** Second line (member role, `footnote` label-secondary). */
  subtitle?: ReactNode;
  /** Right-aligned `body` label-secondary value (e.g. "Automatisch"). */
  value?: ReactNode;
  variant?: ListRowVariant;
  /** Settings tile / action circle icon. */
  icon?: IconName;
  /** Custom leading node (e.g. `<Avatar size={36} />` for member rows). */
  leading?: ReactNode;
  /** Custom trailing node (rendered before the chevron). */
  trailing?: ReactNode;
  /** Disclosure chevron; defaults to `true` for links/buttons except the `action` variant. */
  chevron?: boolean;
  tone?: 'default' | 'destructive';
  /** Navigates (react-router link). */
  to?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  disabled?: boolean;
  /** Root wrapper: `li` (inside `GroupedList`, default) or `div`. */
  wrapper?: 'li' | 'div';
  className?: string;
  'aria-label'?: string;
}

/** Row inside a `GroupedList` card with design separators (inset to the text column). */
export function ListRow({
  title,
  subtitle,
  value,
  variant = 'plain',
  icon,
  leading,
  trailing,
  chevron,
  tone = 'default',
  to,
  onClick,
  disabled = false,
  wrapper = 'li',
  className,
  'aria-label': ariaLabel,
}: ListRowProps) {
  const interactive = to !== undefined || onClick !== undefined;
  const showChevron = chevron ?? (interactive && variant !== 'action');
  const leadingNode =
    leading ??
    (icon ? (
      variant === 'action' ? (
        <span className="homi-list-row__action-icon" aria-hidden="true">
          <Icon name={icon} size={20} strokeWidth={2.16} />
        </span>
      ) : (
        <span className="homi-list-row__tile" aria-hidden="true">
          <Icon name={icon} size={20} strokeWidth={2.16} />
        </span>
      )
    ) : null);

  const content = (
    <>
      {leadingNode}
      <span className="homi-list-row__text">
        <span className="homi-list-row__title">{title}</span>
        {subtitle ? <span className="homi-list-row__subtitle">{subtitle}</span> : null}
      </span>
      {value !== undefined && value !== null ? <span className="homi-list-row__value">{value}</span> : null}
      {trailing}
      {showChevron ? <Icon name="chevR" size={18} strokeWidth={2.67} className="homi-list-row__chevron" /> : null}
    </>
  );

  const rowClass = cx('homi-list-row', className);
  const textParts = [title, subtitle, value].filter((part): part is string => typeof part === 'string' && part !== '');
  const accessibleName = ariaLabel ?? (textParts.length > 1 ? textParts.join(', ') : undefined);
  const dataProps = { 'data-variant': variant, 'data-tone': tone, 'data-interactive': interactive || undefined };
  let row: ReactNode;
  if (to !== undefined && !disabled) {
    row = (
      <Link to={to} className={rowClass} onClick={onClick} aria-label={accessibleName} {...dataProps}>
        {content}
      </Link>
    );
  } else if (onClick || (to !== undefined && disabled)) {
    row = (
      <button
        type="button"
        className={rowClass}
        onClick={onClick}
        disabled={disabled}
        aria-label={accessibleName}
        {...dataProps}
      >
        {content}
      </button>
    );
  } else {
    row = (
      <div className={rowClass} {...dataProps}>
        {content}
      </div>
    );
  }

  return wrapper === 'li' ? <li className="homi-row-item">{row}</li> : <div className="homi-row-item">{row}</div>;
}
