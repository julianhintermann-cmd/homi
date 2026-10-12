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
}: ShoppingItemRowProps) {
  const id = useId();
  const Wrapper = wrapper;
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
