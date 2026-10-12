import { useCallback, useEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { Icon } from '@/icons/Icon';
import { haptic } from '@/lib/haptics';
import { repeatInterval, stepValue } from './stepperMath';
import { cx, enableActiveStates } from './utils';

enableActiveStates();

export type QuantityStepperSize = 'compact' | 'large';

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /**
   * `compact`: 124 × 40 (form rows, minus/plus 18 px). `large`: 196 × 56 (item details:
   * `title2` value, filled label-colour plus button).
   */
  size?: QuantityStepperSize;
  /** Accessible name of the value, e.g. "Menge". */
  label?: string;
  /** Formats the displayed value (e.g. decimal comma). Default: `String(value)`. */
  formatValue?: (value: number) => string;
  /** Spoken value (e.g. "2 Flaschen"). Defaults to the formatted value. */
  valueText?: (value: number) => string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

const SPECS: Record<QuantityStepperSize, { icon: number; stroke: number }> = {
  compact: { icon: 18, stroke: 2.67 },
  large: { icon: 24, stroke: 2 },
};

/**
 * Freegma "Quantity Stepper". Minus/plus are real buttons (press-and-hold repeats with
 * acceleration); the value is a `spinbutton` (Arrow keys, Page Up/Down, Home/End). At the
 * minimum the minus button is disabled and drawn in label-tertiary (Compact/Minimum).
 */
export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  size = 'compact',
  label = 'Menge',
  formatValue = String,
  valueText,
  disabled = false,
  id,
  className,
}: QuantityStepperProps) {
  const spec = SPECS[size];
  const atMin = value <= min;
  const atMax = value >= max;

  // Latest values for timers (a held button keeps stepping from the newest value).
  const latest = useRef({ value, onChange, min, max, step });
  useEffect(() => {
    latest.current = { value, onChange, min, max, step };
  });

  const timer = useRef<number | undefined>(undefined);
  const pointerStepped = useRef(false);

  const stopRepeat = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  useEffect(() => stopRepeat, [stopRepeat]);

  /** Applies one step; returns `false` when the limit was reached. */
  const applyStep = useCallback((direction: 1 | -1): boolean => {
    const current = latest.current;
    const next = stepValue(current.value, direction * current.step, current);
    if (next === current.value) return false;
    latest.current = { ...current, value: next };
    current.onChange(next);
    haptic('selection');
    return true;
  }, []);

  const startRepeat = useCallback(
    (direction: 1 | -1) => {
      stopRepeat();
      let repeatIndex = 0;
      const tick = (): void => {
        if (!applyStep(direction)) {
          stopRepeat();
          return;
        }
        repeatIndex += 1;
        timer.current = window.setTimeout(tick, repeatInterval(repeatIndex));
      };
      timer.current = window.setTimeout(tick, repeatInterval(0));
    },
    [applyStep, stopRepeat],
  );

  const directionOf = (element: HTMLElement): 1 | -1 => (element.dataset.direction === 'up' ? 1 : -1);

  const onPressStart = (event: PointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0 || disabled) return;
    const direction = directionOf(event.currentTarget);
    pointerStepped.current = true;
    if (applyStep(direction)) startRepeat(direction);
  };

  const onPressEnd = (): void => {
    stopRepeat();
    // The click of this press follows in the same task; forget the flag afterwards so a press
    // that never produced a click (button got disabled at the limit) cannot swallow a later one.
    window.setTimeout(() => {
      pointerStepped.current = false;
    }, 0);
  };

  const onPressClick = (event: MouseEvent<HTMLButtonElement>): void => {
    // Pointer presses already stepped on pointer-down; keyboard activation steps here.
    if (pointerStepped.current) {
      pointerStepped.current = false;
      return;
    }
    applyStep(directionOf(event.currentTarget));
  };

  const pressHandlers = {
    onPointerDown: onPressStart,
    onPointerUp: onPressEnd,
    onPointerLeave: stopRepeat,
    onPointerCancel: stopRepeat,
    onContextMenu: (event: MouseEvent<HTMLButtonElement>) => event.preventDefault(),
    onClick: onPressClick,
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (disabled) return;
    const big = step * 10;
    const current = latest.current;
    let next: number | null = null;
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') next = stepValue(current.value, step, current);
    else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') next = stepValue(current.value, -step, current);
    else if (event.key === 'PageUp') next = stepValue(current.value, big, current);
    else if (event.key === 'PageDown') next = stepValue(current.value, -big, current);
    else if (event.key === 'Home' && Number.isFinite(min)) next = min;
    else if (event.key === 'End' && max !== Number.MAX_SAFE_INTEGER) next = max;
    if (next === null) return;
    event.preventDefault();
    if (next !== current.value) {
      latest.current = { ...current, value: next };
      onChange(next);
    }
  };

  const display = formatValue(value);
  return (
    <div
      className={cx('homi-stepper', className)}
      data-size={size}
      data-disabled={disabled || undefined}
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        className="homi-stepper__button homi-stepper__button--minus"
        aria-label={`${label} verringern`}
        disabled={disabled || atMin}
        data-direction="down"
        {...pressHandlers}
      >
        <Icon name="minus" size={spec.icon} strokeWidth={spec.stroke} />
      </button>
      <span
        id={id}
        className="homi-stepper__value"
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={Number.isFinite(min) ? min : undefined}
        aria-valuemax={max !== Number.MAX_SAFE_INTEGER ? max : undefined}
        aria-valuetext={valueText ? valueText(value) : display}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
      >
        {display}
      </span>
      <button
        type="button"
        className="homi-stepper__button homi-stepper__button--plus"
        aria-label={`${label} erhöhen`}
        disabled={disabled || atMax}
        data-direction="up"
        {...pressHandlers}
      >
        <Icon name="plus" size={spec.icon} strokeWidth={spec.stroke} />
      </button>
    </div>
  );
}
