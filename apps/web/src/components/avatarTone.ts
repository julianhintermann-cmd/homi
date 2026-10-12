import { stableHash } from './utils';

/** The three avatar tints of the design (Du = sage, Lisa = sand, Max = mist). */
export type AvatarTone = 'sage' | 'sand' | 'mist';

const OTHER_TONES: readonly AvatarTone[] = ['sand', 'mist'];

/**
 * Stable avatar tint for a person. The signed-in user is always `sage` (as "Du" in the design);
 * everyone else gets `sand` or `mist` from a hash of their id, so nobody else ever looks like
 * "you" and a person keeps the same colour on every device.
 */
export function avatarTone(seed: string, options: { self?: boolean } = {}): AvatarTone {
  if (options.self) return 'sage';
  return OTHER_TONES[stableHash(seed) % OTHER_TONES.length] ?? 'sand';
}

/** First letter of a display name, upper-cased ("lisa" → "L"); `?` for empty names. */
export function initialOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const first = Array.from(trimmed)[0] ?? '?';
  return first.toLocaleUpperCase('de-CH');
}
