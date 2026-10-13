import {
  compareDecimals,
  MoneyInputSchema,
  ShoppingItemNameSchema,
  ShoppingQuantityInputSchema,
  type ShoppingItemDto,
  type Unit,
} from '@homi/shared';
import { formatCHF, formatNumber, formatQuantity, formatUnitPrice, UNIT_LABELS } from '@/lib/format';

/*
 * Parsing and display of the add row's optional "Menge" / "Preis" pills (design 18) and of a row's
 * trailing detail text. Values stay decimal strings ("1.5", "2.40") end to end – never floats.
 * The validation messages are the server's (shared zod schemas).
 */

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const MAX_QUANTITY_INTEGER_DIGITS = 5; // ≤ 99’999.999
const MAX_QUANTITY_DECIMALS = 3;

/**
 * Keystroke filter for the quantity input: digits and one decimal separator ("," or "."),
 * thousands apostrophes/spaces ignored, ≤ 5 integer digits, ≤ 3 decimals. Returns the previous
 * value for keystrokes that cannot lead to a valid quantity.
 */
export function sanitizeQuantityInput(raw: string, previous = ''): string {
  const compact = raw.replace(/[\s'’]/g, '').replace(',', '.');
  if (compact === '') return '';
  if (!/^\d*\.?\d*$/.test(compact)) return previous;
  const [integer = '', decimals] = compact.split('.');
  const trimmedInteger = integer.replace(/^0+(?=\d)/, '');
  if (trimmedInteger.length > MAX_QUANTITY_INTEGER_DIGITS) return previous;
  if (decimals !== undefined && decimals.length > MAX_QUANTITY_DECIMALS) return previous;
  const normalisedInteger = integer === '' && decimals !== undefined ? '0' : trimmedInteger;
  return decimals === undefined ? normalisedInteger : `${normalisedInteger}.${decimals}`;
}

/** Quantity pill text → canonical quantity (`"1,5"` → `"1.5"`), `null` when empty. */
export function parseQuantityDraft(text: string): ParseResult<string | null> {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed === '.') return { ok: true, value: null };
  const parsed = ShoppingQuantityInputSchema.safeParse(trimmed);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Ungültige Menge.' };
  return { ok: true, value: parsed.data };
}

/** Price pill text → canonical CHF amount (`"2,4"` → `"2.40"`), `null` when empty (= unknown price). */
export function parsePriceDraft(text: string): ParseResult<string | null> {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed === '.') return { ok: true, value: null };
  const parsed = MoneyInputSchema.safeParse(trimmed);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Ungültiger Preis.' };
  return { ok: true, value: parsed.data };
}

export interface ItemDraft {
  name: string;
  /** Raw text of the "Menge" pill. */
  quantityText: string;
  unit: Unit;
  /** Raw text of the "Preis" pill. */
  priceText: string;
}

export const EMPTY_DRAFT: ItemDraft = { name: '', quantityText: '', unit: 'STUECK', priceText: '' };

export interface ItemDraftValues {
  name: string;
  quantity: string | null;
  unit: Unit | null;
  unitPrice: string | null;
}

export type DraftField = 'name' | 'quantity' | 'unitPrice';

/**
 * Validates a draft for `POST …/shopping/items`. Without a quantity the unit is dropped too
 * (a unit alone means nothing on a shopping list).
 */
export function parseItemDraft(
  draft: ItemDraft,
): { ok: true; values: ItemDraftValues } | { ok: false; field: DraftField; error: string } {
  const name = ShoppingItemNameSchema.safeParse(draft.name);
  if (!name.success) return { ok: false, field: 'name', error: name.error.issues[0]?.message ?? 'Ungültiger Name.' };
  const quantity = parseQuantityDraft(draft.quantityText);
  if (!quantity.ok) return { ok: false, field: 'quantity', error: quantity.error };
  const price = parsePriceDraft(draft.priceText);
  if (!price.ok) return { ok: false, field: 'unitPrice', error: price.error };
  return {
    ok: true,
    values: {
      name: name.data,
      quantity: quantity.value,
      unit: quantity.value === null ? null : draft.unit,
      unitPrice: price.value,
    },
  };
}

/** "1 kg", "2 Liter", "3" (no unit) or "" – the quantity label of a row or pill. */
export function quantityLabel(quantity: string | null, unit: Unit | null): string {
  if (quantity === null) return '';
  return unit ? formatQuantity(quantity, unit) : formatNumber(quantity);
}

/** "CHF 2.40" or "" for an unknown price (never "CHF 0.00" for unknown). */
export function priceLabel(unitPrice: string | null): string {
  return unitPrice === null ? '' : formatCHF(unitPrice);
}

/**
 * The price as stored: `unitPrice` is the price per unit of the item's unit (contract, like the
 * inventory's "Preis pro Einheit"), so it is shown with that unit – "CHF 2.40 / kg" – and never
 * multiplied into a line total (a pack price typed for "250 g" must not become "CHF 800.00").
 * Without a quantity there is no unit: the plain price ("CHF 2.40").
 */
export function unitPriceLabel(unitPrice: string | null, quantity: string | null, unit: Unit | null): string {
  if (unitPrice === null) return '';
  return quantity !== null && unit ? formatUnitPrice(unitPrice, unit) : formatCHF(unitPrice);
}

/**
 * The price is stored per unit; with a quantity other than 1 that differs from the price of the
 * whole line (3.20 for "250 g" means CHF 3.20 per gram) – then the unit has to be visible.
 */
export function pricePerUnitDiffers(quantity: string | null, unit: Unit | null): boolean {
  return quantity !== null && unit !== null && compareDecimals(quantity, '1') !== 0;
}

/**
 * Value of the closed "Preis" pill: "CHF 3.20 / g" when the price per unit differs from the line
 * price (see {@link pricePerUnitDiffers}) – visible before the item is added; for "1 kg" (design
 * 18) or no quantity both readings agree and the pill shows the plain "CHF 2.40".
 */
export function pillPriceLabel(unitPrice: string | null, quantity: string | null, unit: Unit | null): string {
  if (unitPrice === null) return '';
  if (unit !== null && pricePerUnitDiffers(quantity, unit)) return formatUnitPrice(unitPrice, unit);
  return formatCHF(unitPrice);
}

/** Accessible name of the price ("Preis pro Kilogramm" / "Preis"). */
export function priceFieldName(hasQuantity: boolean, unit: Unit | null): string {
  return hasQuantity && unit ? `Preis pro ${UNIT_LABELS[unit].name}` : 'Preis';
}

/**
 * Trailing text of a shopping row: the quantity and – when known – the price per unit:
 * "2 Liter", "2 Liter · CHF 1.90 / l", "CHF 2.40", "".
 */
export function itemDetailText(item: Pick<ShoppingItemDto, 'quantity' | 'unit' | 'unitPrice'>): string {
  const quantity = quantityLabel(item.quantity, item.unit);
  const price = unitPriceLabel(item.unitPrice, item.quantity, item.unit);
  if (!price) return quantity;
  return quantity ? `${quantity} · ${price}` : price;
}
