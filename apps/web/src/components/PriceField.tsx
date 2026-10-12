import type { Ref } from 'react';
import { finalizePrice, sanitizePriceInput } from './priceInput';
import { TextField, type TextFieldProps } from './TextField';

export interface PriceFieldProps extends Omit<
  TextFieldProps,
  'value' | 'defaultValue' | 'onChange' | 'type' | 'inputMode' | 'leading' | 'label'
> {
  /** Decimal string ("8.50") or "" for an unknown price. */
  value: string;
  onValueChange: (value: string) => void;
  /** Default "Preis pro Einheit". */
  label?: string;
  /** Currency prefix. Default "CHF". */
  currency?: string;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Freegma "Price Input": like `TextField` with the "CHF" prefix (`body` label-secondary at x 16)
 * and the amount at x 58; placeholder "0.00". Decimal keyboard, accepts "," as separator,
 * max. 2 decimals, completed to 2 decimals on blur.
 */
export function PriceField({
  value,
  onValueChange,
  label = 'Preis pro Einheit',
  currency = 'CHF',
  placeholder = '0.00',
  onBlur,
  ref,
  ...rest
}: PriceFieldProps) {
  return (
    <TextField
      {...rest}
      ref={ref}
      label={label}
      leading={<span className="homi-field__prefix">{currency}</span>}
      type="text"
      inputMode="decimal"
      enterKeyHint="done"
      autoComplete="off"
      placeholder={placeholder}
      value={value}
      onChange={(event) => onValueChange(sanitizePriceInput(event.target.value, value))}
      onBlur={(event) => {
        const finalized = finalizePrice(value);
        if (finalized !== value) onValueChange(finalized);
        onBlur?.(event);
      }}
    />
  );
}
