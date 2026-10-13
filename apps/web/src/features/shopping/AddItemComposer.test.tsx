import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddItemComposer } from './AddItemComposer';

function renderComposer() {
  const onAdd = vi.fn();
  render(<AddItemComposer afterProgress onAdd={onAdd} />);
  return { onAdd, input: screen.getByRole('textbox', { name: 'Artikel hinzufügen' }) };
}

describe('AddItemComposer', () => {
  it('adds with Return, clears the row and keeps the focus for the next item', async () => {
    const user = userEvent.setup();
    const { onAdd, input } = renderComposer();
    expect(screen.queryByRole('group', { name: 'Optionale Angaben' })).not.toBeInTheDocument();

    await user.click(input);
    expect(screen.getByRole('group', { name: 'Optionale Angaben' })).toBeInTheDocument();
    await user.type(input, '  Milch {Enter}');
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0]?.[0]).toEqual({ name: 'Milch', quantity: null, unit: null, unitPrice: null });
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();

    await user.type(input, 'Eier{Enter}');
    expect(onAdd).toHaveBeenCalledTimes(2);
    // Return on an empty row adds nothing.
    await user.type(input, '{Enter}');
    expect(onAdd).toHaveBeenCalledTimes(2);
  });

  it('parses the Menge and Preis pills (design 18: Zwiebeln, 1 kg, CHF 2.40)', async () => {
    const user = userEvent.setup();
    const { onAdd, input } = renderComposer();
    await user.click(input);
    await user.type(input, 'Zwiebeln');

    await user.click(screen.getByRole('button', { name: 'Menge angeben' }));
    const amount = screen.getByRole('textbox', { name: 'Menge' });
    expect(amount).toHaveFocus();
    // The pill keeps saying what it is while editing.
    expect(amount).toHaveAttribute('placeholder', 'Menge');
    await user.type(amount, '1,5x');
    expect(amount).toHaveValue('1.5');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Einheit' }), 'KILOGRAMM');

    // With a quantity the price is per unit – said by the accessible name and the "/ kg" suffix.
    await user.click(screen.getByRole('button', { name: 'Preis pro Kilogramm angeben' }));
    const price = screen.getByRole('textbox', { name: 'Preis pro Kilogramm in CHF' });
    expect(screen.getByRole('group', { name: 'Preis' })).toHaveTextContent('CHF/ kg');
    await user.type(price, '2,4');
    await user.click(input);
    expect(screen.getByRole('button', { name: 'Menge: 1.5 kg' })).toBeInTheDocument();
    // 1.5 kg: the closed pill keeps the unit visible (price per kg, not for the whole line); the
    // value takes the room of the word "Preis" (tag icon + accessible name remain).
    expect(screen.getByRole('button', { name: 'Preis pro Kilogramm: CHF 2.40 / kg' })).toHaveTextContent(
      /^CHF 2\.40 \/ kg$/,
    );

    await user.type(input, '{Enter}');
    expect(onAdd.mock.calls[0]?.[0]).toEqual({
      name: 'Zwiebeln',
      quantity: '1.5',
      unit: 'KILOGRAMM',
      unitPrice: '2.40',
    });
    // The unit is kept for rapid entry, the values are cleared.
    expect(screen.getByRole('button', { name: 'Menge angeben' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preis angeben' })).toBeInTheDocument();
  });

  it('regression: "250 g · Preis 3.20" shows the per-gram meaning before adding; "1 kg" stays like design 18', async () => {
    const user = userEvent.setup();
    const { onAdd, input } = renderComposer();
    await user.click(input);
    await user.type(input, 'Butter');
    await user.click(screen.getByRole('button', { name: 'Menge angeben' }));
    await user.type(screen.getByRole('textbox', { name: 'Menge' }), '250');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Einheit' }), 'GRAMM');
    await user.click(screen.getByRole('button', { name: 'Preis pro Gramm angeben' }));
    await user.type(screen.getByRole('textbox', { name: 'Preis pro Gramm in CHF' }), '3.20');
    await user.click(input);
    expect(screen.getByRole('button', { name: 'Preis pro Gramm: CHF 3.20 / g' })).toHaveTextContent(/^CHF 3\.20 \/ g$/);

    // Back to 1 kg (design 18): price per unit = line price, the pill reads "Preis CHF 2.40".
    await user.click(screen.getByRole('button', { name: 'Menge: 250 g' }));
    const amount = screen.getByRole('textbox', { name: 'Menge' });
    await user.clear(amount);
    await user.type(amount, '1');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Einheit' }), 'KILOGRAMM');
    await user.click(screen.getByRole('button', { name: 'Preis pro Kilogramm: CHF 3.20' }));
    const price = screen.getByRole('textbox', { name: 'Preis pro Kilogramm in CHF' });
    await user.clear(price);
    await user.type(price, '2.40');
    await user.click(input);
    expect(screen.getByRole('button', { name: 'Preis pro Kilogramm: CHF 2.40' })).toHaveTextContent(/^PreisCHF 2\.40$/);
    await user.type(input, '{Enter}');
    expect(onAdd.mock.calls[0]?.[0]).toEqual({ name: 'Butter', quantity: '1', unit: 'KILOGRAMM', unitPrice: '2.40' });
  });

  it('asks for a plain price without a quantity', async () => {
    const user = userEvent.setup();
    const { onAdd, input } = renderComposer();
    await user.click(input);
    await user.type(input, 'Brot');
    await user.click(screen.getByRole('button', { name: 'Preis angeben' }));
    expect(screen.getByRole('group', { name: 'Preis' })).not.toHaveTextContent('/');
    await user.type(screen.getByRole('textbox', { name: 'Preis in CHF' }), '3.2{Enter}');
    expect(onAdd.mock.calls[0]?.[0]).toEqual({ name: 'Brot', quantity: null, unit: null, unitPrice: '3.20' });
  });

  it('shows the server-side validation message instead of adding an invalid quantity', async () => {
    const user = userEvent.setup();
    const { onAdd, input } = renderComposer();
    await user.click(input);
    await user.type(input, 'Butter');
    await user.click(screen.getByRole('button', { name: 'Menge angeben' }));
    await user.type(screen.getByRole('textbox', { name: 'Menge' }), '0{Enter}');
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Die Menge muss grösser als 0 sein.');
  });

  it('restores the text when the add fails and the row is still empty', async () => {
    const user = userEvent.setup();
    const { onAdd, input } = renderComposer();
    await user.type(input, 'Spülmittel{Enter}');
    expect(input).toHaveValue('');
    const restore = onAdd.mock.calls[0]?.[1] as () => void;
    restore();
    expect(await screen.findByDisplayValue('Spülmittel')).toBe(input);
  });

  it('Escape discards the draft', async () => {
    const user = userEvent.setup();
    const { onAdd, input } = renderComposer();
    await user.type(input, 'Tomaten{Escape}');
    expect(input).toHaveValue('');
    expect(input).not.toHaveFocus();
    expect(onAdd).not.toHaveBeenCalled();
  });
});
