import type { CSSProperties } from 'react';
import { Icon } from '@/icons/Icon';
import { avatarTone, initialOf, type AvatarTone } from './avatarTone';
import { cx } from './utils';

export type { AvatarTone } from './avatarTone';

export interface AvatarProps {
  /** Display name – the initial is derived from it and it is the accessible name. */
  name: string;
  /** Diameter in px. Design sizes: 24 (stack), 36 (rows, profile), 44, 48 (chat header), 54 (chat list), 72, 80. */
  size?: number;
  /** Explicit tint; otherwise derived from `seed` (user id) via `avatarTone()`. */
  tone?: AvatarTone;
  /** Stable id for the tint hash (defaults to `name`). */
  seed?: string;
  /** The signed-in user ("Du") – always sage. */
  self?: boolean;
  /** Household avatar: label-coloured disc with the `house` glyph in the background colour. */
  household?: boolean;
  /** Hide from assistive tech when the name is already announced next to it. Default `true`. */
  decorative?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * Freegma "Avatar": tinted disc with the initial (600, size × 0.4, lh 1.25, −0.2 tracking).
 * The household variant shows the `house` glyph at half the size, 1.9 px stroke, nudged up 1 %
 * like the design (FIDELITY §4.3).
 */
export function Avatar({
  name,
  size = 44,
  tone,
  seed,
  self = false,
  household = false,
  decorative = true,
  className,
  style,
}: AvatarProps) {
  const resolvedTone = tone ?? avatarTone(seed ?? name, { self });
  const a11y = decorative ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': name };
  const vars = {
    '--avatar-size': `${size}px`,
    '--avatar-font-size': `${Math.round(size * 0.4)}px`,
    ...style,
  } as CSSProperties;

  if (household) {
    const glyph = Math.round(size / 2);
    return (
      <span className={cx('homi-avatar homi-avatar--household', className)} style={vars} {...a11y}>
        <Icon name="house" size={glyph} weight={1.9} style={{ translate: `0 ${-(size * 0.01).toFixed(2)}px` }} />
      </span>
    );
  }

  return (
    <span className={cx('homi-avatar', className)} data-tone={resolvedTone} style={vars} {...a11y}>
      {initialOf(name)}
    </span>
  );
}

export interface AvatarStackPerson {
  id: string;
  name: string;
  self?: boolean;
  tone?: AvatarTone;
}

export interface AvatarStackProps {
  people: readonly AvatarStackPerson[];
  /** Avatar diameter (design: 24). */
  size?: number;
  /** Maximum avatars before a "+N" counter. Default 3. */
  max?: number;
  /** Colour of the 2 px separating ring – the surface the stack sits on. Default `--color-bg`. */
  ringColor?: string;
  className?: string;
}

/**
 * Overlapping member avatars (design: 24 px, 2 px outer ring in the background colour,
 * 18 px pitch → 6 px overlap; later avatars paint on top).
 */
export function AvatarStack({ people, size = 24, max = 3, ringColor, className }: AvatarStackProps) {
  const visible = people.slice(0, max);
  const hidden = people.length - visible.length;
  const label = people.map((person) => person.name).join(', ');
  const style = {
    '--avatar-stack-size': `${size}px`,
    ...(ringColor ? { '--avatar-ring': ringColor } : null),
  } as CSSProperties;
  return (
    <span className={cx('homi-avatar-stack', className)} role="img" aria-label={label} style={style}>
      {visible.map((person) => (
        <Avatar
          key={person.id}
          name={person.name}
          seed={person.id}
          self={person.self}
          tone={person.tone}
          size={size}
          className="homi-avatar-stack__item"
        />
      ))}
      {hidden > 0 ? (
        <span className="homi-avatar homi-avatar-stack__item homi-avatar-stack__more" aria-hidden="true">
          +{hidden}
        </span>
      ) : null}
    </span>
  );
}
