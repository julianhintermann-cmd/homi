import type { MouseEventHandler } from 'react';
import { Link } from 'react-router';
import { Avatar, type AvatarTone } from './Avatar';
import { cx, enableActiveStates } from './utils';

enableActiveStates();

export interface ProfileButtonProps {
  /** Display name of the signed-in user (initial + accessible description). */
  name: string;
  tone?: AvatarTone;
  /** Accessible label of the button. Default "Haushalt & Profil". */
  label?: string;
  /** Navigates like a link (preferred: `paths.household`). */
  to?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  className?: string;
}

/**
 * Freegma "Profile Button": 44 px glass circle holding the user's 36 px avatar
 * (initial 14 / 600). Light: sage avatar; dark: `#2A2A2E` / `#E5E5EA` via tokens.
 */
export function ProfileButton({
  name,
  tone = 'sage',
  label = 'Haushalt & Profil',
  to,
  onClick,
  className,
}: ProfileButtonProps) {
  const content = <Avatar name={name} tone={tone} size={36} />;
  const classes = cx('glass glass--pressable homi-profile-button', className);
  if (to !== undefined) {
    return (
      <Link to={to} aria-label={label} title={label} className={classes} onClick={onClick}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} title={label} className={classes} onClick={onClick}>
      {content}
    </button>
  );
}
