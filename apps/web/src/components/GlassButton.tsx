import type { ButtonHTMLAttributes, Ref } from 'react';
import { Icon, type IconName } from '@/icons/Icon';
import { cx, enableActiveStates } from './utils';

enableActiveStates();

/**
 * - `regular`: 44 px Back/Icon/Close button (icon 22 px, stroke 2.18 = 2 px rendered)
 * - `fab`: 56 px Floating Add Button (icon 26 px, stroke 1.85)
 * - `sheet`: 44 px sheet Close/Delete button (icon 20 px, stroke 2.4)
 */
export type GlassButtonSize = 'regular' | 'fab' | 'sheet';
export type GlassButtonTone = 'default' | 'destructive' | 'accent';

export interface GlassButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  /** Accessible label (icon-only button) – German, e.g. "Zurück". */
  label: string;
  size?: GlassButtonSize;
  tone?: GlassButtonTone;
  /** Shows the pressed look permanently (design review / gallery only). */
  forcePressed?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

const ICON_SPECS: Record<GlassButtonSize, { size: number; stroke: number }> = {
  regular: { size: 22, stroke: 2.18 },
  fab: { size: 26, stroke: 1.85 },
  sheet: { size: 20, stroke: 2.4 },
};

/**
 * Liquid Glass round button (Freegma "Back Button", "Icon Button", "Floating Add Button",
 * sheet close/delete). Pressed: the material is replaced by a 10 % (FAB: 8 %) black fill,
 * edge and shadow stay (FIDELITY §2.1).
 */
export function GlassButton({
  icon,
  label,
  size = 'regular',
  tone = 'default',
  forcePressed = false,
  type = 'button',
  className,
  title,
  ...rest
}: GlassButtonProps) {
  const spec = ICON_SPECS[size];
  return (
    <button
      type={type}
      aria-label={label}
      title={title ?? label}
      data-size={size}
      data-tone={tone}
      data-pressed={forcePressed || undefined}
      className={cx('glass glass--pressable homi-glass-button', className)}
      {...rest}
    >
      <Icon name={icon} size={spec.size} strokeWidth={spec.stroke} />
    </button>
  );
}
