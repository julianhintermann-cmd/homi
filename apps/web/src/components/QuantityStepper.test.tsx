import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuantityStepper } from './QuantityStepper';
import { repeatInterval, stepPrecision, stepValue } from './stepperMath';

function Controlled({
  initial = 2,
  min = 1,
  max,
  onChange,
}: {
  initial?: number;
  min?: number;
  max?: number;
  onChange?: (v: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <QuantityStepper
      value={value}
      min={min}
      max={max}
      label="Menge"
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe('stepperMath', () => {
  it('derives the precision of a step', () => {
    expect(stepPrecision(1)).toBe(0);
    expect(stepPrecision(0.25)).toBe(2);
    expect(stepPrecision(1e-7)).toBe(7);
  });

  it('steps without float noise and clamps into [min, max]', () => {
    expect(stepValue(0.1, 0.2, { min: 0, max: 10, step: 0.1 })).toBe(0.3);
    expect(stepValue(1, -1, { min: 1, max: 10, step: 1 })).toBe(1);
    expect(stepValue(10, 1, { min: 0, max: 10, step: 1 })).toBe(10);
  });

  it('accelerates the auto-repeat but never below the minimum interval', () => {
    expect(repeatInterval(0)).toBe(400);
    expect(repeatInterval(1)).toBe(120);
    expect(repeatInterval(2)).toBeLessThan(120);
    expect(repeatInterval(100)).toBe(45);
  });
});

describe('QuantityStepper', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes an accessible group, buttons and spinbutton', () => {
    render(<Controlled initial={2} />);
    expect(screen.getByRole('group', { name: 'Menge' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menge verringern' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Menge erhöhen' })).toBeEnabled();
    const value = screen.getByRole('spinbutton', { name: 'Menge' });
    expect(value).toHaveAttribute('aria-valuenow', '2');
    expect(value).toHaveAttribute('aria-valuemin', '1');
  });

  it('disables minus at the minimum (Compact/Minimum state)', () => {
    render(<Controlled initial={1} min={1} />);
    expect(screen.getByRole('button', { name: 'Menge verringern' })).toBeDisabled();
  });

  it('changes the value by exactly one step per tap (pointer press + click)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={2} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Menge erhöhen' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(3);
    await user.click(screen.getByRole('button', { name: 'Menge verringern' }));
    expect(onChange).toHaveBeenLastCalledWith(2);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('steps once per keyboard activation of a button', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={2} onChange={onChange} />);
    screen.getByRole('button', { name: 'Menge erhöhen' }).focus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(3);
  });

  it('supports arrow keys, Home and End on the spinbutton', () => {
    const onChange = vi.fn();
    render(<Controlled initial={2} min={1} max={9} onChange={onChange} />);
    const value = screen.getByRole('spinbutton');
    fireEvent.keyDown(value, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith(3);
    fireEvent.keyDown(value, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(value, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith(9);
    fireEvent.keyDown(value, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('auto-repeats while held and stops on release', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<Controlled initial={2} max={50} onChange={onChange} />);
    const plus = screen.getByRole('button', { name: 'Menge erhöhen' });
    fireEvent.pointerDown(plus, { button: 0 });
    expect(onChange).toHaveBeenLastCalledWith(3);
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onChange).toHaveBeenLastCalledWith(4);
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(onChange).toHaveBeenLastCalledWith(5);
    fireEvent.pointerUp(plus);
    const calls = onChange.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onChange).toHaveBeenCalledTimes(calls);
  });

  it('stops repeating at the limit', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<Controlled initial={2} min={1} onChange={onChange} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Menge verringern' }), { button: 0 });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(1);
    expect(screen.getByRole('button', { name: 'Menge verringern' })).toBeDisabled();
  });

  it('does nothing when disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<QuantityStepper value={3} onChange={onChange} disabled />);
    await user.click(screen.getByRole('button', { name: 'Menge erhöhen' }));
    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'ArrowUp' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
