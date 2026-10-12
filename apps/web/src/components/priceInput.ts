/**
 * Price entry helpers for `PriceField` (CHF, two decimals). Values stay **strings** end to end
 * (ARCHITECTURE §3: never use floats for money).
 */

/**
 * Normalises raw keyboard input: digits plus one decimal separator (`.` or `,`); spaces and
 * thousands apostrophes are ignored; max. 2 decimals and 8 integer digits (Decimal(10,2)).
 * Returns the previous value when the input cannot be a valid prefix.
 */
export function sanitizePriceInput(raw: string, previous = ''): string {
  const compact = raw.replace(/[\s'’]/g, '').replace(',', '.');
  if (compact === '') return '';
  if (!/^\d*\.?\d*$/.test(compact)) return previous;
  const [integer = '', decimals] = compact.split('.');
  if (integer.replace(/^0+(?=\d)/, '').length > 8) return previous;
  if (decimals !== undefined && decimals.length > 2) return previous;
  const normalisedInteger = integer === '' && decimals !== undefined ? '0' : integer.replace(/^0+(?=\d)/, '');
  return decimals === undefined ? normalisedInteger : `${normalisedInteger}.${decimals}`;
}

/** Completes a typed price on blur: "8" → "8.00", "8.5" → "8.50", "" stays "" (unknown price). */
export function finalizePrice(value: string): string {
  if (value === '' || value === '.') return '';
  const [integer = '0', decimals = ''] = value.split('.');
  return `${integer === '' ? '0' : integer}.${decimals.padEnd(2, '0').slice(0, 2)}`;
}
