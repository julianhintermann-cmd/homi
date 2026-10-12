import { lineTotal, toFixedDecimal, trimDecimal } from '@homi/shared';
import type { Prisma } from '../db';

/*
 * Conversions between Prisma `Decimal` (decimal.js) columns and the API's decimal strings.
 * Never go through JS numbers.
 */

type DecimalLike = Prisma.Decimal | { toFixed(digits?: number): string } | string;

function decimalToString(value: DecimalLike): string {
  // decimal.js `toFixed()` without argument never uses exponential notation.
  return typeof value === 'string' ? value : value.toFixed();
}

/** Decimal(10,2)/Decimal(12,2) column → `"8.50"`. */
export function moneyToString(value: DecimalLike): string {
  return toFixedDecimal(decimalToString(value), 2);
}

/** Nullable money column → `"8.50" | null`. */
export function optionalMoneyToString(value: DecimalLike | null | undefined): string | null {
  return value === null || value === undefined ? null : moneyToString(value);
}

/** Decimal(12,3) quantity column → `"1.5"` (no insignificant zeros). */
export function quantityToString(value: DecimalLike): string {
  return trimDecimal(toFixedDecimal(decimalToString(value), 3));
}

export function optionalQuantityToString(value: DecimalLike | null | undefined): string | null {
  return value === null || value === undefined ? null : quantityToString(value);
}

/** quantity × unitPrice as `"25.50"`, `null` when the price is unknown. */
export function totalValueToString(quantity: DecimalLike, unitPrice: DecimalLike | null | undefined): string | null {
  return lineTotal(quantityToString(quantity), optionalMoneyToString(unitPrice));
}
