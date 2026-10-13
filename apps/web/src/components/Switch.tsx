import type { InputHTMLAttributes, Ref } from 'react';
import { haptic } from '@/lib/haptics';
import { cx } from './utils';

export interface SwitchProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'role' | 'checked' | 'defaultChecked' | 'onChange' | 'size'
> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Accessible name, usually the title of the row the switch sits in (e.g. "Transparenz reduzieren"). */
  label: string;
  ref?: Ref<HTMLInputElement>;
}

/**
 * On/off switch in the Homi language (settings rows, e.g. "Transparenz reduzieren"): 51 × 31
 * capsule track – fill-secondary when off, accent when on – with a white 27 px thumb that slides
 * (transform only, static under reduced motion). A native `role="switch"` checkbox with a
 * ≥ 44 px hit area keeps keyboard and screen-reader behaviour.
 */
export function Switch({ checked, onCheckedChange, label, disabled, className, ref, ...rest }: SwitchProps) {
  return (
    <span
      className={cx('homi-switch', className)}
      data-checked={checked || undefined}
      data-disabled={disabled || undefined}
    >
      <input
        ref={ref}
        type="checkbox"
        role="switch"
        className="homi-switch__input"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => {
          haptic('selection');
          onCheckedChange(event.target.checked);
        }}
        {...rest}
      />
      <span className="homi-switch__track" aria-hidden="true">
        <span className="homi-switch__thumb" />
      </span>
    </span>
  );
}
