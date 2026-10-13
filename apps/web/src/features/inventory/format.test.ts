import { describe, expect, it } from 'vitest';
import {
  deleteConfirmMessage,
  itemSubtitle,
  itemTotalLabel,
  itemUnitPriceLabel,
  listSubtitle,
  shareText,
  totalPreview,
  unitOptionLabel,
} from './format';

describe('inventory row formatting (design 02)', () => {
  it('formats the subtitle with category, quantity and pluralised unit', () => {
    expect(itemSubtitle({ category: 'KUECHE', quantity: '24', unit: 'STUECK' })).toBe('Küche · 24 Stück');
    expect(itemSubtitle({ category: 'KUECHE', quantity: '2', unit: 'FLASCHE' })).toBe('Küche · 2 Flaschen');
    expect(itemSubtitle({ category: 'KUECHE', quantity: '1', unit: 'FLASCHE' })).toBe('Küche · 1 Flasche');
    expect(itemSubtitle({ category: 'KUECHE', quantity: '4', unit: 'ROLLE' })).toBe('Küche · 4 Rollen');
    expect(itemSubtitle({ category: 'TECHNIK', quantity: '1.5', unit: 'KILOGRAMM' })).toBe('Technik · 1.5 kg');
    expect(itemSubtitle({ category: 'SONSTIGES', quantity: '1250', unit: 'GRAMM' })).toBe('Sonstiges · 1’250 g');
  });

  it('formats total and unit price, and never shows unknown prices as CHF 0.00', () => {
    const caps = { totalValue: '12.96', unitPrice: '0.54', unit: 'STUECK' as const };
    expect(itemTotalLabel(caps)).toBe('CHF 12.96');
    expect(itemUnitPriceLabel(caps)).toBe('CHF 0.54 / Stk.');
    expect(itemUnitPriceLabel({ unitPrice: '8.50', unit: 'FLASCHE' })).toBe('CHF 8.50 / Fl.');
    expect(itemUnitPriceLabel({ unitPrice: '7.95', unit: 'PACKUNG' })).toBe('CHF 7.95 / Pkg.');
    expect(itemUnitPriceLabel({ unitPrice: '1.45', unit: 'ROLLE' })).toBe('CHF 1.45 / Rolle');
    expect(itemTotalLabel({ totalValue: '2485.50' })).toBe('CHF 2’485.50');
    expect(itemTotalLabel({ totalValue: null })).toBeNull();
    expect(itemUnitPriceLabel({ unitPrice: null, unit: 'STUECK' })).toBeNull();
    // a known price of 0 is a real value
    expect(itemTotalLabel({ totalValue: '0.00' })).toBe('CHF 0.00');
  });

  it('builds the header subtitle for all, search (17) and category', () => {
    expect(listSubtitle({ total: 128 })).toBe('128 Artikel in deinem Haushalt');
    expect(listSubtitle({ total: 0 })).toBe('0 Artikel in deinem Haushalt');
    expect(listSubtitle({ total: 1250 })).toBe('1’250 Artikel in deinem Haushalt');
    expect(listSubtitle({ total: 1, search: 'Oliv' })).toBe('1 Treffer für «Oliv»');
    expect(listSubtitle({ total: 3, search: 'Oliv', category: 'KUECHE' })).toBe('3 Treffer für «Oliv»');
    expect(listSubtitle({ total: 12, category: 'KUECHE' })).toBe('12 Artikel in Küche');
  });

  it('previews the form total (design 06) and marks unknown prices', () => {
    expect(totalPreview('2', '8.50')).toEqual({ text: '2 × CHF 8.50 = CHF 17.00', known: true });
    expect(totalPreview('24', '0,54')).toEqual({ text: '24 × CHF 0.54 = CHF 12.96', known: true });
    expect(totalPreview('0.333', '1.5')).toEqual({ text: '0.333 × CHF 1.50 = CHF 0.50', known: true });
    expect(totalPreview('2', '')).toEqual({ text: 'Preis unbekannt', known: false });
    expect(totalPreview('', '8.50')).toEqual({ text: 'Preis unbekannt', known: false });
    expect(totalPreview('2', '8.505')).toEqual({ text: 'Preis unbekannt', known: false });
  });

  it('formats dialog, share and unit picker texts', () => {
    expect(deleteConfirmMessage('Olivenöl', 'Unser Zuhause')).toBe(
      '«Olivenöl» wird aus dem Inventar von Unser Zuhause entfernt.',
    );
    expect(deleteConfirmMessage('Olivenöl', null)).toBe('«Olivenöl» wird aus dem Inventar entfernt.');
    expect(shareText({ name: 'Olivenöl', quantity: '2', unit: 'FLASCHE', totalValue: '17.00' })).toBe(
      'Olivenöl · 2 Flaschen · CHF 17.00',
    );
    expect(shareText({ name: 'Salz', quantity: '1', unit: 'PACKUNG', totalValue: null })).toBe('Salz · 1 Packung');
    expect(unitOptionLabel('2', 'FLASCHE')).toBe('Flaschen');
    expect(unitOptionLabel('1', 'FLASCHE')).toBe('Flasche');
    expect(unitOptionLabel('', 'PACKUNG')).toBe('Packungen');
  });
});
