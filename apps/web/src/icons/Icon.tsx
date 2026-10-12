import type { CSSProperties, SVGAttributes } from 'react';
import { ICON_PATHS, type IconName } from './paths';

export type { IconName } from './paths';

/**
 * Markup per icon with the `CURRENT` fill marker resolved to `currentColor`.
 * The path data is a static, trusted constant (design extraction) – never user input.
 */
const ICON_MARKUP = Object.fromEntries(
  Object.entries(ICON_PATHS).map(([name, markup]) => [name, markup.replaceAll('CURRENT', 'currentColor')]),
) as Record<IconName, string>;

/** Default rendered line weight of the design's SF-Symbols-style icons (Foundations: 1.7 pt). */
export const ICON_DEFAULT_WEIGHT = 1.7;

/**
 * Converts an intended rendered line weight (CSS px) into a `stroke-width` in viewBox units
 * for an icon drawn at `size` px (the viewBox is always 24 units wide).
 */
function iconStrokeForWeight(weight: number, size: number): number {
  return Math.round(((weight * 24) / size) * 1000) / 1000;
}

export interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, 'children' | 'dangerouslySetInnerHTML'> {
  name: IconName;
  /** Rendered size in CSS px (width = height). Default 24. */
  size?: number;
  /**
   * `stroke-width` in **viewBox units** – the value stored in the design file for that usage
   * (FIDELITY.md §3.1, e.g. 2.67 for an 18 px chevron = 2 px rendered). Takes precedence over `weight`.
   */
  strokeWidth?: number;
  /** Intended rendered line weight in CSS px (converted for `size`). Default 1.7. */
  weight?: number;
  /** Accessible name. Without it the icon is decorative (`aria-hidden`). */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Design-system icon: 24 × 24 viewBox glyph from `ICON_PATHS`, stroked with `currentColor`
 * (round caps/joins). Size and colour come from the caller; the stroke is compensated so the
 * rendered line weight matches the design at every size.
 */
export function Icon({ name, size = 24, strokeWidth, weight, label, className, style, ...rest }: IconProps) {
  const stroke = strokeWidth ?? iconStrokeForWeight(weight ?? ICON_DEFAULT_WEIGHT, size);
  const a11y = label
    ? { role: 'img', 'aria-label': label }
    : { 'aria-hidden': true as const, focusable: 'false' as const };
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `homi-icon ${className}` : 'homi-icon'}
      style={style}
      data-icon={name}
      {...a11y}
      {...rest}
      dangerouslySetInnerHTML={{ __html: ICON_MARKUP[name] }}
    />
  );
}
