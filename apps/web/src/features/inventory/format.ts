import {
  MoneyInputSchema,
  QuantityInputSchema,
  multiplyDecimals,
  type InventoryItemDto,
  type ItemCategory,
  type Unit,
} from '@homi/shared';
import {
  ITEM_CATEGORY_LABELS,
  formatCHF,
  formatNumber,
  formatQuantity,
  formatUnitPrice,
  unitLabelFor,
} from '@/lib/format';

/*
 * Display strings of the inventory screens (design 02, 05, 06, 14–17). All money/quantity text
 * goes through `@/lib/format`; an unknown price (`null`) is never shown as "CHF 0.00".
 */

type RowItem = Pick<InventoryItemDto, 'category' | 'quantity' | 'unit' | 'unitPrice' | 'totalValue'>;

/** "Küche · 24 Stück", "Küche · 1 Flasche", "Küche · 1.5 kg". */
export function itemSubtitle(item: Pick<RowItem, 'category' | 'quantity' | 'unit'>): string {
  return `${ITEM_CATEGORY_LABELS[item.category]} · ${formatQuantity(item.quantity, item.unit)}`;
}

/** Row total "CHF 12.96", or `null` when the price is unknown. */
export function itemTotalLabel(item: Pick<RowItem, 'totalValue'>): string | null {
  return item.totalValue === null ? null : formatCHF(item.totalValue);
}

/** Row unit price "CHF 8.50 / Fl.", or `null` when unknown. */
export function itemUnitPriceLabel(item: Pick<RowItem, 'unitPrice' | 'unit'>): string | null {
  return item.unitPrice === null ? null : formatUnitPrice(item.unitPrice, item.unit);
}

export interface ListSubtitleInput {
  total: number;
  /** Active (debounced) search term. */
  search?: string | null;
  category?: ItemCategory | null;
}

/**
 * Header subtitle: "128 Artikel in deinem Haushalt" (design 02), "1 Treffer für «Oliv»" (17),
 * "12 Artikel in Küche" with a category chip.
 */
export function listSubtitle({ total, search, category }: ListSubtitleInput): string {
  const count = formatNumber(String(total), 0);
  if (search) return `${count} Treffer für «${search}»`;
  if (category) return `${count} Artikel in ${ITEM_CATEGORY_LABELS[category]}`;
  return `${count} Artikel in deinem Haushalt`;
}

export interface TotalPreview {
  /** "2 × CHF 8.50 = CHF 17.00", or "Preis unbekannt". */
  text: string;
  /** `false` → rendered as a placeholder (label-tertiary). */
  known: boolean;
}

/** Form total preview from the raw form inputs (design 06: "2 × CHF 8.50 = CHF 17.00"). */
export function totalPreview(quantity: string, unitPrice: string): TotalPreview {
  const parsedQuantity = QuantityInputSchema.safeParse(quantity);
  const parsedPrice = unitPrice.trim() === '' ? null : MoneyInputSchema.safeParse(unitPrice);
  if (!parsedQuantity.success || !parsedPrice?.success) return { text: 'Preis unbekannt', known: false };
  const total = multiplyDecimals(parsedQuantity.data, parsedPrice.data, 2);
  return {
    text: `${formatNumber(parsedQuantity.data)} × ${formatCHF(parsedPrice.data)} = ${formatCHF(total)}`,
    known: true,
  };
}

/** Confirmation text of design 15: "«Olivenöl» wird aus dem Inventar von Unser Zuhause entfernt." */
export function deleteConfirmMessage(name: string, householdName: string | null | undefined): string {
  return householdName
    ? `«${name}» wird aus dem Inventar von ${householdName} entfernt.`
    : `«${name}» wird aus dem Inventar entfernt.`;
}

/** Text shared via the system share sheet / clipboard. */
export function shareText(item: Pick<InventoryItemDto, 'name' | 'quantity' | 'unit' | 'totalValue'>): string {
  const parts = [item.name, formatQuantity(item.quantity, item.unit)];
  if (item.totalValue !== null) parts.push(formatCHF(item.totalValue));
  return parts.join(' · ');
}

/** Unit picker label for the current quantity ("Flaschen" for 2, "Flasche" for 1). */
export function unitOptionLabel(quantity: string, unit: Unit): string {
  const parsed = QuantityInputSchema.safeParse(quantity);
  return unitLabelFor(parsed.success ? parsed.data : '2', unit);
}
