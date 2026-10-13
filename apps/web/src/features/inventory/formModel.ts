import {
  ItemNameSchema,
  MoneyInputSchema,
  QuantityInputSchema,
  UNIT_STEP,
  compareDecimals,
  type CreateItemRequest,
  type InventoryItemDto,
  type ItemCategory,
  type Unit,
  type UpdateItemRequest,
} from '@homi/shared';

/*
 * Item form model (design 06 "Neuer Artikel" / 07 "Artikel bearbeiten"): raw input values,
 * validation with the shared API schemas, and the create / partial-update payloads.
 */

export interface ItemFormValues {
  name: string;
  /** `''` = not chosen yet ("Auswählen"); saved as "Sonstiges". */
  category: ItemCategory | '';
  /** Decimal string ("2", "1.5"). */
  quantity: string;
  /** `''` = untouched (shown as the "Stück" placeholder); saved as "Stück". */
  unit: Unit | '';
  /** CHF per unit as typed in the price field; `''` = unknown price. */
  unitPrice: string;
}

export type ItemFormField = keyof ItemFormValues;

export const EMPTY_ITEM_FORM: ItemFormValues = { name: '', category: '', quantity: '1', unit: '', unitPrice: '' };

export const DEFAULT_CATEGORY: ItemCategory = 'SONSTIGES';
export const DEFAULT_UNIT: Unit = 'STUECK';

export function formValuesFromItem(item: InventoryItemDto): ItemFormValues {
  return {
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice ?? '',
  };
}

export function effectiveUnit(values: Pick<ItemFormValues, 'unit'>): Unit {
  return values.unit || DEFAULT_UNIT;
}

/** Stepper step of the chosen unit (1 Stück, 0.5 kg, 50 g, …). */
export function quantityStep(values: Pick<ItemFormValues, 'unit'>): number {
  return Number(UNIT_STEP[effectiveUnit(values)]);
}

export type ItemFormErrors = Partial<Record<'name' | 'quantity' | 'unitPrice', string>>;

function firstIssue(result: { success: boolean; error?: { issues: ReadonlyArray<{ message: string }> } }): string {
  return result.error?.issues[0]?.message ?? 'Ungültiger Wert.';
}

/** Field errors using the same rules as the API (name required, decimal limits). */
export function validateItemForm(values: ItemFormValues): ItemFormErrors {
  const errors: ItemFormErrors = {};
  const name = ItemNameSchema.safeParse(values.name);
  if (!name.success) errors.name = firstIssue(name);
  const quantity = QuantityInputSchema.safeParse(values.quantity);
  if (!quantity.success) errors.quantity = firstIssue(quantity);
  if (values.unitPrice.trim() !== '') {
    const price = MoneyInputSchema.safeParse(values.unitPrice);
    if (!price.success) errors.unitPrice = firstIssue(price);
  }
  return errors;
}

export function isItemFormValid(values: ItemFormValues): boolean {
  return Object.keys(validateItemForm(values)).length === 0;
}

function normalizedPrice(raw: string): string | null {
  if (raw.trim() === '') return null;
  const parsed = MoneyInputSchema.safeParse(raw);
  return parsed.success ? parsed.data : raw;
}

function normalizedQuantity(raw: string): string {
  const parsed = QuantityInputSchema.safeParse(raw);
  return parsed.success ? parsed.data : raw;
}

/** Field-by-field comparison on normalised values ("8.5" equals "8.50", "" equals nothing). */
export function sameFieldValue(field: ItemFormField, a: ItemFormValues, b: ItemFormValues): boolean {
  switch (field) {
    case 'name':
      return a.name.trim() === b.name.trim();
    case 'quantity': {
      const left = normalizedQuantity(a.quantity);
      const right = normalizedQuantity(b.quantity);
      try {
        return compareDecimals(left, right) === 0;
      } catch {
        return left === right;
      }
    }
    case 'unitPrice': {
      const left = normalizedPrice(a.unitPrice);
      const right = normalizedPrice(b.unitPrice);
      return left === right;
    }
    case 'unit':
      return effectiveUnit(a) === effectiveUnit(b);
    default:
      return a[field] === b[field];
  }
}

const FIELDS: readonly ItemFormField[] = ['name', 'category', 'quantity', 'unit', 'unitPrice'];

export function changedFields(values: ItemFormValues, base: ItemFormValues): ItemFormField[] {
  return FIELDS.filter((field) => !sameFieldValue(field, values, base));
}

export function isItemFormDirty(values: ItemFormValues, base: ItemFormValues): boolean {
  return changedFields(values, base).length > 0;
}

export function toCreateRequest(values: ItemFormValues, imageId: string | null): CreateItemRequest {
  return {
    name: values.name.trim(),
    category: values.category || DEFAULT_CATEGORY,
    quantity: normalizedQuantity(values.quantity),
    unit: effectiveUnit(values),
    unitPrice: normalizedPrice(values.unitPrice),
    imageId,
  };
}

/** Only the fields that differ from `base` (plus `version`); `imageId: undefined` = photo unchanged. */
export function toUpdateRequest(
  values: ItemFormValues,
  base: ItemFormValues,
  version: number,
  imageId: string | null | undefined,
): UpdateItemRequest {
  const request: UpdateItemRequest = { version };
  for (const field of changedFields(values, base)) {
    if (field === 'name') request.name = values.name.trim();
    else if (field === 'category') request.category = values.category || DEFAULT_CATEGORY;
    else if (field === 'quantity') request.quantity = normalizedQuantity(values.quantity);
    else if (field === 'unit') request.unit = effectiveUnit(values);
    else request.unitPrice = normalizedPrice(values.unitPrice);
  }
  if (imageId !== undefined) request.imageId = imageId;
  return request;
}

/**
 * After a version conflict: start from the newest server values and re-apply only the fields the
 * user had changed, so their edits survive the reload.
 */
export function rebaseItemForm(
  values: ItemFormValues,
  oldBase: ItemFormValues,
  newBase: ItemFormValues,
): ItemFormValues {
  const next: ItemFormValues = { ...newBase };
  for (const field of changedFields(values, oldBase)) copyField(next, values, field);
  return next;
}

function copyField<K extends ItemFormField>(target: ItemFormValues, source: ItemFormValues, field: K): void {
  target[field] = source[field];
}
