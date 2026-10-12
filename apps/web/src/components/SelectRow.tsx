import { useId, type ChangeEvent, type Ref } from 'react';
import { Icon } from '@/icons/Icon';
import { cx } from './utils';

export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
  disabled?: boolean;
}

export interface SelectRowProps<V extends string = string> {
  /** Row label (`body` label colour), e.g. "Kategorie". */
  label: string;
  /** Selected value or `''`/`null` for none (shows `placeholder` in label-tertiary). */
  value: V | '' | null;
  options: readonly SelectOption<V>[];
  onValueChange: (value: V, event: ChangeEvent<HTMLSelectElement>) => void;
  /** Default "Auswählen". */
  placeholder?: string;
  /**
   * `standalone`: Freegma "Category Selector" (r 14, 1 px separator ring, 1.5 px accent ring
   * while open). `inset`: form row inside a `FormCard` (no ring, hairline separators).
   */
  variant?: 'standalone' | 'inset';
  disabled?: boolean;
  name?: string;
  id?: string;
  required?: boolean;
  /** Show the open/focused look permanently (gallery only). */
  forceOpen?: boolean;
  /** Wrapper element for `inset` rows inside a list card. Default `div`. */
  wrapper?: 'li' | 'div';
  className?: string;
  ref?: Ref<HTMLSelectElement>;
}

/**
 * Category/unit selector row: label left, current value right-aligned to x 305 (label-secondary;
 * placeholder label-tertiary) and the 20 px `updown` glyph at x 315. A transparent native
 * `<select>` covers the row, so iOS shows its native wheel picker (best UX, fully accessible).
 */
export function SelectRow<V extends string = string>({
  label,
  value,
  options,
  onValueChange,
  placeholder = 'Auswählen',
  variant = 'standalone',
  disabled = false,
  name,
  id,
  required,
  forceOpen = false,
  wrapper = 'div',
  className,
  ref,
}: SelectRowProps<V>) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const labelId = `${selectId}-label`;
  const selected = options.find((option) => option.value === value);
  const Wrapper = wrapper;
  return (
    <Wrapper
      className={cx('homi-select-row', className)}
      data-variant={variant}
      data-open={forceOpen || undefined}
      data-disabled={disabled || undefined}
    >
      <span id={labelId} className="homi-select-row__label">
        {label}
      </span>
      <span className="homi-select-row__value" data-placeholder={selected ? undefined : ''} aria-hidden="true">
        {selected ? selected.label : placeholder}
      </span>
      <Icon name="updown" size={20} strokeWidth={2.16} className="homi-select-row__icon" />
      <select
        ref={ref}
        id={selectId}
        name={name}
        className="homi-select-row__select"
        value={value ?? ''}
        disabled={disabled}
        required={required}
        aria-labelledby={labelId}
        onChange={(event) => {
          const next = options.find((option) => option.value === event.target.value);
          if (next) onValueChange(next.value, event);
        }}
      >
        {!selected ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </Wrapper>
  );
}
