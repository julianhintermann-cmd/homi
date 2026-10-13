import { useId } from 'react';
import { Checkbox } from './Checkbox';
import { cx, enableActiveStates } from './utils';

enableActiveStates();

export interface ShoppingItemRowProps {
  name: string;
  /** "12 Stück", "250 g" … (empty when unknown). */
  quantity?: string;
  completed: boolean;
  onCompletedChange?: (completed: boolean) => void;
  disabled?: boolean;
  /** Root wrapper: `li` (inside a list card, default) or `div`. */
  wrapper?: 'li' | 'div';
  className?: string;
  /**
   * Makes the row (everything but the checkbox) a button, e.g. to open the item for editing.
   * Without it the whole row is the checkbox label.
   */
  onPress?: () => void;
  /** Accessible name of the `onPress` button. Default "{name}, {quantity} bearbeiten". */
  pressLabel?: string;
}

/**
 * Freegma "Shopping List Row" at its 52 px list pitch (content sits 2 px below centre):
 * checkbox at (16, 15), `body` name at x 56, `subhead` quantity right-aligned to x 337.
 * Completed: accent check, name + quantity in label-tertiary – no strike-through.
 * The whole row is the checkbox label (large tap target while shopping).
 */
export function ShoppingItemRow({
  name,
  quantity,
  completed,
  onCompletedChange,
  disabled = false,
  wrapper = 'li',
  className,
  onPress,
  pressLabel,
}: ShoppingItemRowProps) {
  const id = useId();
  const Wrapper = wrapper;
  if (onPress) {
    const label = quantity ? `${name}, ${quantity}` : name;
    return (
      <Wrapper className="homi-row-item">
        <div
          className={cx('homi-shopping-row', className)}
          data-completed={completed || undefined}
          data-disabled={disabled || undefined}
        >
          <Checkbox
            checked={completed}
            disabled={disabled}
            label={label}
            onCheckedChange={(next) => onCompletedChange?.(next)}
            className="homi-shopping-row__checkbox"
          />
          <button
            type="button"
            className="homi-shopping-row__body"
            disabled={disabled}
            aria-label={pressLabel ?? `${label} bearbeiten`}
            onClick={onPress}
          >
            <span className="homi-shopping-row__name">{name}</span>
            {quantity ? <span className="homi-shopping-row__quantity">{quantity}</span> : null}
          </button>
        </div>
      </Wrapper>
    );
  }
  return (
    <Wrapper className="homi-row-item">
      <label
        htmlFor={id}
        className={cx('homi-shopping-row', className)}
        data-completed={completed || undefined}
        data-disabled={disabled || undefined}
      >
        <Checkbox
          id={id}
          checked={completed}
          disabled={disabled}
          // Explicit name: the adjacent spans would otherwise be read as "Eier12 Stück".
          label={quantity ? `${name}, ${quantity}` : name}
          onCheckedChange={(next) => onCompletedChange?.(next)}
          className="homi-shopping-row__checkbox"
        />
        <span className="homi-shopping-row__name">{name}</span>
        {quantity ? <span className="homi-shopping-row__quantity">{quantity}</span> : null}
      </label>
    </Wrapper>
  );
}
