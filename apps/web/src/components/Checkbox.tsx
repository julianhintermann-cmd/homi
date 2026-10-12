import { useState, type ChangeEvent, type InputHTMLAttributes, type Ref } from 'react';
import { Icon } from '@/icons/Icon';
import { haptic } from '@/lib/haptics';
import { cx } from './utils';

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'checked' | 'defaultChecked' | 'onChange' | 'size'
> {
  checked: boolean;
  onCheckedChange?: (checked: boolean, event: ChangeEvent<HTMLInputElement>) => void;
  /** Accessible name when there is no associated `<label>` (e.g. "Milch erledigt"). */
  label?: string;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Freegma "Checkbox" (26 px circle). Default: 1.6 px inner label-tertiary ring. Completed:
 * accent fill + 18 px white check (2.4 px). Ticking plays a restrained spring (scale 0.9 → 1,
 * ≈ 0.35 s, no animation with reduced motion). Native checkbox for semantics; 44 px hit area.
 */
export function Checkbox({ checked, onCheckedChange, label, className, disabled, ref, ...rest }: CheckboxProps) {
  // Only animate ticks the user made (not boxes that are already checked on first render).
  const [interacted, setInteracted] = useState(false);
  return (
    <span
      className={cx('homi-checkbox', className)}
      data-checked={checked || undefined}
      data-animate={interacted || undefined}
      data-disabled={disabled || undefined}
    >
      <input
        ref={ref}
        type="checkbox"
        className="homi-checkbox__input"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => {
          setInteracted(true);
          if (event.target.checked) haptic('light');
          onCheckedChange?.(event.target.checked, event);
        }}
        {...rest}
      />
      <span className="homi-checkbox__box" aria-hidden="true">
        <Icon name="check" size={18} strokeWidth={3.2} className="homi-checkbox__check" />
      </span>
    </span>
  );
}
