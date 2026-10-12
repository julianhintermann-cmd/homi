import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { haptic } from '@/lib/haptics';
import { cx, enableActiveStates } from './utils';

enableActiveStates();

export interface SegmentedOption<V extends string> {
  value: V;
  label: string;
}

export interface SegmentedControlProps<V extends string> {
  /** Accessible name of the group, e.g. "Erscheinungsbild". */
  label: string;
  value: V;
  options: readonly SegmentedOption<V>[];
  onValueChange: (value: V) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Segmented control in the Homi language (e.g. Erscheinungsbild: Automatisch / Hell / Dunkel):
 * 36 px fill-secondary capsule track, the selected segment is a raised surface thumb (glass
 * shadow) that slides between segments (transform only). Radio-group semantics with arrow keys.
 */
export function SegmentedControl<V extends string>({
  label,
  value,
  options,
  onValueChange,
  disabled = false,
  className,
}: SegmentedControlProps<V>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const style = { '--segment-count': String(options.length), '--segment-index': String(index) } as CSSProperties;

  const select = (next: number, focus: boolean): void => {
    const option = options[(next + options.length) % options.length];
    if (!option) return;
    if (option.value !== value) {
      haptic('selection');
      onValueChange(option.value);
    }
    if (focus) refs.current[(next + options.length) % options.length]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') select(index + 1, true);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') select(index - 1, true);
    else if (event.key === 'Home') select(0, true);
    else if (event.key === 'End') select(options.length - 1, true);
    else return;
    event.preventDefault();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={cx('homi-segmented', className)}
      style={style}
    >
      <span className="homi-segmented__thumb" aria-hidden="true" />
      {options.map((option, optionIndex) => {
        const checked = optionIndex === index;
        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[optionIndex] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={disabled}
            data-checked={checked || undefined}
            className="homi-segmented__option"
            onClick={() => select(optionIndex, false)}
            onKeyDown={onKeyDown}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
