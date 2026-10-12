import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './Checkbox';
import { ShoppingItemRow } from './ShoppingItemRow';

function Controlled({ onChange }: { onChange?: (checked: boolean) => void }) {
  const [checked, setChecked] = useState(false);
  return (
    <Checkbox
      checked={checked}
      label="Milch erledigt"
      onCheckedChange={(next) => {
        setChecked(next);
        onChange?.(next);
      }}
    />
  );
}

describe('Checkbox', () => {
  it('is a native, labelled checkbox', () => {
    render(<Checkbox checked={false} label="Milch erledigt" />);
    const box = screen.getByRole('checkbox', { name: 'Milch erledigt' });
    expect(box).not.toBeChecked();
  });

  it('toggles and reports the new state', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Milch erledigt' });
    await user.click(box);
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(box).toBeChecked();
    await user.click(box);
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(box).not.toBeChecked();
  });

  it('can be toggled with the keyboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    screen.getByRole('checkbox').focus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('only animates ticks made by the user (not initially checked boxes)', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(<Checkbox checked label="Erledigt" />);
    const root = container.querySelector('.homi-checkbox');
    expect(root).toHaveAttribute('data-checked');
    expect(root).not.toHaveAttribute('data-animate');
    rerender(<Controlled />);
    await user.click(screen.getByRole('checkbox'));
    expect(container.querySelector('.homi-checkbox')).toHaveAttribute('data-animate');
  });

  it('does not change when disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox checked={false} disabled label="Erledigt" onCheckedChange={onChange} />);
    await user.click(screen.getByRole('checkbox'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('ShoppingItemRow', () => {
  it('uses the whole row as the checkbox label and marks completed rows', async () => {
    const user = userEvent.setup();
    const onCompletedChange = vi.fn();
    const { container } = render(
      <ul>
        <ShoppingItemRow name="Eier" quantity="12 Stück" completed={false} onCompletedChange={onCompletedChange} />
      </ul>,
    );
    const box = screen.getByRole('checkbox', { name: 'Eier, 12 Stück' });
    await user.click(screen.getByText('Eier'));
    expect(onCompletedChange).toHaveBeenCalledWith(true);
    expect(box).toBeInTheDocument();
    expect(container.querySelector('.homi-shopping-row')).not.toHaveAttribute('data-completed');
  });
});
