import { useRef, type FormEvent, type InputHTMLAttributes, type KeyboardEvent, type Ref } from 'react';
import { Icon } from '@/icons/Icon';
import { cx } from './utils';

export interface HomiSearchFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'onSubmit' | 'type' | 'size'
> {
  value: string;
  onValueChange: (value: string) => void;
  /** Return/Enter pressed (the field keeps its value). */
  onSubmit?: (value: string) => void;
  /** Default "Suchen". Design: "Artikel suchen" on the inventory. */
  placeholder?: string;
  /** Accessible name (defaults to the placeholder). */
  label?: string;
  /** Show the focused look permanently (gallery only). */
  forceFocused?: boolean;
  className?: string;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Freegma "Search Field" (353 × 44, r 22, `--color-fill-secondary`): 20 px search glyph at
 * (14, 12), placeholder `body` label-secondary at x 42. With text: label-colour value, accent caret
 * and a 20 px label-tertiary clear disc with a white xmark at x 319. No focus ring (design).
 */
export function HomiSearchField({
  value,
  onValueChange,
  onSubmit,
  placeholder = 'Suchen',
  label,
  forceFocused = false,
  className,
  onKeyDown,
  ref,
  ...rest
}: HomiSearchFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const setRefs = (element: HTMLInputElement | null): void => {
    inputRef.current = element;
    if (typeof ref === 'function') ref(element);
    else if (ref) ref.current = element;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSubmit?.(value);
    // Hide the keyboard on iOS after "Suchen".
    inputRef.current?.blur();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === 'Escape' && value) {
      event.preventDefault();
      event.stopPropagation();
      onValueChange('');
    }
  };

  return (
    <form
      role="search"
      className={cx('homi-search', className)}
      data-focused={forceFocused || undefined}
      data-has-value={value ? '' : undefined}
      onSubmit={handleSubmit}
      action=""
    >
      <Icon name="search" size={20} strokeWidth={2.28} className="homi-search__icon" />
      <input
        ref={setRefs}
        type="search"
        className="homi-search__input"
        value={value}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        {...rest}
      />
      {value ? (
        <button
          type="button"
          className="homi-search__clear"
          aria-label="Suchbegriff löschen"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            onValueChange('');
            inputRef.current?.focus();
          }}
        >
          <span className="homi-search__clear-disc" aria-hidden="true">
            <Icon name="xmark" size={14} strokeWidth={4.11} />
          </span>
        </button>
      ) : null}
    </form>
  );
}
