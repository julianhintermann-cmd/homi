import { describe, expect, it } from 'vitest';
import {
  EMPTY_DRAFT,
  itemDetailText,
  parseItemDraft,
  parsePriceDraft,
  parseQuantityDraft,
  pillPriceLabel,
  priceFieldName,
  priceLabel,
  quantityLabel,
  sanitizeQuantityInput,
  unitPriceLabel,
} from './draft';

describe('quantity pill', () => {
  it('filters keystrokes to a decimal with ≤ 3 decimals and ≤ 5 integer digits', () => {
    expect(sanitizeQuantityInput('1,5')).toBe('1.5');
    expect(sanitizeQuantityInput('0,25')).toBe('0.25');
    expect(sanitizeQuantityInput(',5')).toBe('0.5');
    expect(sanitizeQuantityInput('1’250')).toBe('1250');
    expect(sanitizeQuantityInput('007')).toBe('7');
    expect(sanitizeQuantityInput('1.2345', '1.234')).toBe('1.234');
    expect(sanitizeQuantityInput('123456', '12345')).toBe('12345');
    expect(sanitizeQuantityInput('1kg', '1')).toBe('1');
    expect(sanitizeQuantityInput('1.2.3', '1.2')).toBe('1.2');
    expect(sanitizeQuantityInput('')).toBe('');
  });

  it('parses to canonical decimal strings and rejects zero', () => {
    expect(parseQuantityDraft('')).toEqual({ ok: true, value: null });
    expect(parseQuantityDraft('  ')).toEqual({ ok: true, value: null });
    expect(parseQuantityDraft('1')).toEqual({ ok: true, value: '1' });
    expect(parseQuantityDraft('1,50')).toEqual({ ok: true, value: '1.5' });
    expect(parseQuantityDraft('0.125')).toEqual({ ok: true, value: '0.125' });
    expect(parseQuantityDraft('0')).toEqual({ ok: false, error: 'Die Menge muss grösser als 0 sein.' });
    expect(parseQuantityDraft('abc')).toEqual({ ok: false, error: 'Bitte gib eine gültige Menge ein.' });
  });

  it('labels quantities with the unit, or the bare number', () => {
    expect(quantityLabel('1', 'KILOGRAMM')).toBe('1 kg');
    expect(quantityLabel('2', 'LITER')).toBe('2 Liter');
    expect(quantityLabel('1', 'FLASCHE')).toBe('1 Flasche');
    expect(quantityLabel('1250', 'GRAMM')).toBe('1’250 g');
    expect(quantityLabel('3', null)).toBe('3');
    expect(quantityLabel(null, 'STUECK')).toBe('');
  });
});

describe('price pill', () => {
  it('parses CHF amounts to two decimals, empty = unknown price', () => {
    expect(parsePriceDraft('2,4')).toEqual({ ok: true, value: '2.40' });
    expect(parsePriceDraft('2.40')).toEqual({ ok: true, value: '2.40' });
    expect(parsePriceDraft('1’250.5')).toEqual({ ok: true, value: '1250.50' });
    expect(parsePriceDraft('0')).toEqual({ ok: true, value: '0.00' });
    expect(parsePriceDraft('')).toEqual({ ok: true, value: null });
    expect(parsePriceDraft('2.405')).toEqual({
      ok: false,
      error: 'Der Preis darf höchstens 2 Nachkommastellen haben.',
    });
    expect(parsePriceDraft('100000')).toEqual({
      ok: false,
      error: 'Der Preis darf höchstens CHF 99’999.99 betragen.',
    });
  });

  it('never shows an unknown price as CHF 0.00', () => {
    expect(priceLabel(null)).toBe('');
    expect(priceLabel('0.00')).toBe('CHF 0.00');
    expect(priceLabel('2.4')).toBe('CHF 2.40');
  });

  it('spells out the unit in the closed pill as soon as the price per unit differs from the line price', () => {
    // Regression: "Butter 250 g, Preis 3.20" looked like a pack price but is stored per gram.
    expect(pillPriceLabel('3.20', '250', 'GRAMM')).toBe('CHF 3.20 / g');
    expect(pillPriceLabel('0.45', '12', 'STUECK')).toBe('CHF 0.45 / Stk.');
    expect(pillPriceLabel('1.20', '0.5', 'KILOGRAMM')).toBe('CHF 1.20 / kg');
    // Quantity 1 (design 18: 1 kg, CHF 2.40) or no quantity: both readings agree.
    expect(pillPriceLabel('2.40', '1', 'KILOGRAMM')).toBe('CHF 2.40');
    expect(pillPriceLabel('2.40', '1.000', 'KILOGRAMM')).toBe('CHF 2.40');
    expect(pillPriceLabel('2.40', null, 'KILOGRAMM')).toBe('CHF 2.40');
    expect(pillPriceLabel(null, '250', 'GRAMM')).toBe('');
  });
});

describe('parseItemDraft', () => {
  it('rejects names that would show up blank, like the server', () => {
    for (const name of ['\u200B', '\u2060\u200B', '\u00AD', '\u3164', '\u2800']) {
      expect(parseItemDraft({ ...EMPTY_DRAFT, name })).toEqual({
        ok: false,
        field: 'name',
        error: 'Bitte gib einen Namen ein.',
      });
    }
    expect(parseItemDraft({ ...EMPTY_DRAFT, name: 'Milch\u200E' })).toMatchObject({ ok: false, field: 'name' });
    expect(parseItemDraft({ ...EMPTY_DRAFT, name: '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}' })).toMatchObject({
      ok: true,
    });
  });

  it('needs only a name', () => {
    expect(parseItemDraft({ ...EMPTY_DRAFT, name: '  Milch ' })).toEqual({
      ok: true,
      values: { name: 'Milch', quantity: null, unit: null, unitPrice: null },
    });
  });

  it('combines the pills (design 18: "Zwiebeln", 1 kg, CHF 2.40)', () => {
    expect(parseItemDraft({ name: 'Zwiebeln', quantityText: '1', unit: 'KILOGRAMM', priceText: '2,4' })).toEqual({
      ok: true,
      values: { name: 'Zwiebeln', quantity: '1', unit: 'KILOGRAMM', unitPrice: '2.40' },
    });
  });

  it('drops the unit without a quantity and reports the first invalid field', () => {
    expect(parseItemDraft({ name: 'Brot', quantityText: '', unit: 'STUECK', priceText: '3.20' })).toEqual({
      ok: true,
      values: { name: 'Brot', quantity: null, unit: null, unitPrice: '3.20' },
    });
    expect(parseItemDraft({ ...EMPTY_DRAFT, name: '   ' })).toMatchObject({ ok: false, field: 'name' });
    expect(parseItemDraft({ ...EMPTY_DRAFT, name: 'x'.repeat(81) })).toMatchObject({
      ok: false,
      field: 'name',
      error: 'Der Name darf höchstens 80 Zeichen lang sein.',
    });
    expect(parseItemDraft({ ...EMPTY_DRAFT, name: 'Milch', quantityText: '0' })).toMatchObject({
      ok: false,
      field: 'quantity',
    });
    expect(parseItemDraft({ ...EMPTY_DRAFT, name: 'Milch', priceText: '1.234' })).toMatchObject({
      ok: false,
      field: 'unitPrice',
    });
  });
});

describe('itemDetailText', () => {
  it('shows the quantity and the price per unit as stored (never a multiplied line total)', () => {
    expect(itemDetailText({ quantity: '2', unit: 'LITER', unitPrice: null })).toBe('2 Liter');
    expect(itemDetailText({ quantity: '2', unit: 'LITER', unitPrice: '1.90' })).toBe('2 Liter · CHF 1.90 / l');
    expect(itemDetailText({ quantity: '0.5', unit: 'KILOGRAMM', unitPrice: '4.25' })).toBe('0.5 kg · CHF 4.25 / kg');
    expect(itemDetailText({ quantity: '6', unit: 'STUECK', unitPrice: '0.45' })).toBe('6 Stück · CHF 0.45 / Stk.');
    expect(itemDetailText({ quantity: null, unit: null, unitPrice: '2.40' })).toBe('CHF 2.40');
    expect(itemDetailText({ quantity: null, unit: null, unitPrice: null })).toBe('');
  });

  it('regression: "Butter 250 g, Preis 3.20" is not shown as CHF 800.00', () => {
    const text = itemDetailText({ quantity: '250', unit: 'GRAMM', unitPrice: '3.20' });
    expect(text).toBe('250 g · CHF 3.20 / g');
    expect(text).not.toContain('800');
  });
});

describe('price per unit labels', () => {
  it('names the unit the price refers to', () => {
    expect(unitPriceLabel('2.4', '1', 'KILOGRAMM')).toBe('CHF 2.40 / kg');
    expect(unitPriceLabel('2.4', null, null)).toBe('CHF 2.40');
    expect(unitPriceLabel(null, '1', 'KILOGRAMM')).toBe('');
    expect(priceFieldName(true, 'KILOGRAMM')).toBe('Preis pro Kilogramm');
    expect(priceFieldName(false, 'KILOGRAMM')).toBe('Preis');
  });
});
