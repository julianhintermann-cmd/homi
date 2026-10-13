import { describe, expect, it } from 'vitest';
import type { InventoryItemDto } from '@homi/shared';
import {
  EMPTY_ITEM_FORM,
  changedFields,
  formValuesFromItem,
  isItemFormDirty,
  isItemFormValid,
  quantityStep,
  rebaseItemForm,
  toCreateRequest,
  toUpdateRequest,
  validateItemForm,
  type ItemFormValues,
} from './formModel';
import { totalPreview } from './format';

const oil: InventoryItemDto = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  name: 'Olivenöl',
  category: 'KUECHE',
  quantity: '2',
  unit: 'FLASCHE',
  unitPrice: '8.50',
  totalValue: '17.00',
  image: null,
  createdBy: null,
  createdAt: '2026-10-12T08:00:00.000Z',
  updatedAt: '2026-10-12T08:00:00.000Z',
  version: 3,
};

describe('item form model (design 06/07)', () => {
  it('starts empty and invalid (06 leer: button disabled) until a name is entered', () => {
    expect(EMPTY_ITEM_FORM).toEqual({ name: '', category: '', quantity: '1', unit: '', unitPrice: '' });
    expect(isItemFormValid(EMPTY_ITEM_FORM)).toBe(false);
    expect(validateItemForm(EMPTY_ITEM_FORM)).toEqual({ name: 'Bitte gib einen Namen ein.' });
    expect(validateItemForm({ ...EMPTY_ITEM_FORM, name: '   ' }).name).toBe('Bitte gib einen Namen ein.');
    expect(isItemFormValid({ ...EMPTY_ITEM_FORM, name: 'Olivenöl' })).toBe(true);
    expect(totalPreview(EMPTY_ITEM_FORM.quantity, EMPTY_ITEM_FORM.unitPrice).known).toBe(false);
  });

  it('validates quantity and price with the API rules', () => {
    const base: ItemFormValues = { ...EMPTY_ITEM_FORM, name: 'Mehl' };
    expect(validateItemForm({ ...base, quantity: '1.2345' }).quantity).toBe(
      'Die Menge darf höchstens 3 Nachkommastellen haben.',
    );
    expect(validateItemForm({ ...base, quantity: '' }).quantity).toBeDefined();
    expect(validateItemForm({ ...base, quantity: '100000' }).quantity).toBe('Die Menge ist zu gross.');
    expect(validateItemForm({ ...base, unitPrice: '100000' }).unitPrice).toBe(
      'Der Preis darf höchstens CHF 99’999.99 betragen.',
    );
    expect(validateItemForm({ ...base, unitPrice: '8,50' })).toEqual({});
    expect(validateItemForm({ ...base, name: 'x'.repeat(81) }).name).toBe(
      'Der Name darf höchstens 80 Zeichen lang sein.',
    );
  });

  it('builds the create request (06 ausgefüllt) with defaults for untouched pickers', () => {
    const filled: ItemFormValues = {
      name: ' Olivenöl ',
      category: 'KUECHE',
      quantity: '2',
      unit: 'FLASCHE',
      unitPrice: '8.5',
    };
    expect(toCreateRequest(filled, 'img-1')).toEqual({
      name: 'Olivenöl',
      category: 'KUECHE',
      quantity: '2',
      unit: 'FLASCHE',
      unitPrice: '8.50',
      imageId: 'img-1',
    });
    expect(totalPreview(filled.quantity, filled.unitPrice).text).toBe('2 × CHF 8.50 = CHF 17.00');
    expect(toCreateRequest({ ...EMPTY_ITEM_FORM, name: 'Kerzen' }, null)).toEqual({
      name: 'Kerzen',
      category: 'SONSTIGES',
      quantity: '1',
      unit: 'STUECK',
      unitPrice: null,
      imageId: null,
    });
  });

  it('sends only changed fields plus the version when editing (07)', () => {
    const base = formValuesFromItem(oil);
    expect(base).toEqual({ name: 'Olivenöl', category: 'KUECHE', quantity: '2', unit: 'FLASCHE', unitPrice: '8.50' });
    expect(isItemFormDirty(base, base)).toBe(false);
    // equivalent spellings are not changes
    expect(isItemFormDirty({ ...base, unitPrice: '8.5', name: 'Olivenöl ' }, base)).toBe(false);

    const edited = { ...base, unitPrice: '9', quantity: '3' };
    expect(changedFields(edited, base)).toEqual(['quantity', 'unitPrice']);
    expect(toUpdateRequest(edited, base, oil.version, undefined)).toEqual({
      version: 3,
      quantity: '3',
      unitPrice: '9.00',
    });
    expect(toUpdateRequest({ ...base, unitPrice: '' }, base, 3, null)).toEqual({
      version: 3,
      unitPrice: null,
      imageId: null,
    });
  });

  it('keeps the user’s changes when rebasing onto a newer version after a 409', () => {
    const oldBase = formValuesFromItem(oil);
    const mine = { ...oldBase, unitPrice: '9.00' };
    // someone else meanwhile renamed it and tapped +1
    const newBase = { ...oldBase, name: 'Olivenöl extra', quantity: '3' };
    expect(rebaseItemForm(mine, oldBase, newBase)).toEqual({ ...newBase, unitPrice: '9.00' });
  });

  it('uses the unit step for the stepper', () => {
    expect(quantityStep({ unit: '' })).toBe(1);
    expect(quantityStep({ unit: 'KILOGRAMM' })).toBe(0.5);
    expect(quantityStep({ unit: 'GRAMM' })).toBe(50);
  });
});
