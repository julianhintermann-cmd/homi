import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuantityStepper } from '@/components';
import { formatNumber } from '@/lib/format';

const format = (value: number): string => formatNumber(String(value));

// Review finding: "1’500 ml" was clipped to "1’50" in the compact stepper of the form (07):
// the value slot had a fixed width of 44 px.
describe('Quantity stepper value slot', () => {
  it('sizes the editable slot from a hidden copy of the shown text', () => {
    render(<QuantityStepper value={1500} onChange={vi.fn()} editable formatValue={format} max={99_999} />);
    const input = screen.getByRole('spinbutton', { name: 'Menge' });
    const sizer = input.parentElement?.querySelector('.homi-stepper__sizer');
    expect(input).toHaveValue('1’500');
    expect(sizer).toHaveTextContent('1’500');
    expect(sizer).toHaveAttribute('aria-hidden', 'true');

    // while typing, the slot follows the draft
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '12500,5' } });
    expect(sizer).toHaveTextContent('12500,5');
  });
});
